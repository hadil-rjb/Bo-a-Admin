"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GscService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const crypto_1 = require("../common/crypto");
const gsc_schema_1 = require("./gsc.schema");
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const day = (d) => d.toISOString().slice(0, 10);
let GscService = class GscService {
    conn;
    cfg;
    jwt;
    access;
    cache = new Map();
    constructor(conn, cfg, jwt) {
        this.conn = conn;
        this.cfg = cfg;
        this.jwt = jwt;
    }
    get secret() { return this.cfg.getOrThrow("JWT_SECRET"); }
    get site() { return this.cfg.get("GSC_SITE") || "sc-domain:uxboga.com"; }
    get configured() { return !!this.cfg.get("GOOGLE_CLIENT_ID") && !!this.cfg.get("GOOGLE_CLIENT_SECRET"); }
    get frontUrl() { return this.cfg.get("FRONTEND_URL") || "http://localhost:3000"; }
    get redirectUri() { return this.cfg.get("GOOGLE_REDIRECT_URI") || "http://localhost:4000/api/gsc/callback"; }
    async status() {
        const c = await this.conn.findOne();
        const site = c?.site ?? this.site;
        const domain = site.startsWith("sc-domain:") ? site.slice(10) : new URL(site).host;
        return { configured: this.configured, connected: !!c, site, domain, connectedAt: c?.connectedAt ?? null };
    }
    /** URL de consentement Google. `state` = JWT court signé (anti-CSRF + identifie l'admin) */
    async authUrl(userId) {
        if (!this.configured)
            throw new common_1.BadRequestException("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants dans le .env");
        const state = await this.jwt.signAsync({ sub: userId, purpose: "gsc" }, { expiresIn: "10m" });
        const q = new URLSearchParams({
            client_id: this.cfg.getOrThrow("GOOGLE_CLIENT_ID"), redirect_uri: this.redirectUri, response_type: "code",
            scope: SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    }
    async token(body) {
        const res = await fetch(TOKEN_URL, {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: this.cfg.getOrThrow("GOOGLE_CLIENT_ID"), client_secret: this.cfg.getOrThrow("GOOGLE_CLIENT_SECRET"), ...body }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok)
            throw Object.assign(new Error(j.error_description ?? j.error ?? "Google OAuth error"), { code: j.error });
        return j;
    }
    async handleCallback(code, state) {
        try {
            const p = await this.jwt.verifyAsync(state);
            if (p.purpose !== "gsc")
                throw new Error();
        }
        catch {
            throw new common_1.UnauthorizedException("État OAuth invalide ou expiré — relancez la connexion");
        }
        const t = await this.token({ code, grant_type: "authorization_code", redirect_uri: this.redirectUri });
        if (!t.refresh_token)
            throw new common_1.BadRequestException("Google n'a pas renvoyé de refresh token — révoquez l'accès de l'app puis reconnectez");
        await this.conn.findOneAndUpdate({}, { refreshToken: (0, crypto_1.encrypt)(t.refresh_token, this.secret), site: this.site, connectedAt: new Date() }, { upsert: true });
        this.access = undefined;
        this.cache.clear();
    }
    /** Propriétés Search Console accessibles au compte connecté */
    async sites() {
        const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${await this.accessToken()}` } });
        const j = await res.json().catch(() => ({}));
        if (!res.ok)
            throw new common_1.BadGatewayException(j.error?.message ?? "Impossible de lister les propriétés");
        return (j.siteEntry ?? []).map((e) => ({ site: e.siteUrl, level: e.permissionLevel }));
    }
    async setSite(site) {
        const ok = (await this.sites()).some(s => s.site === site);
        if (!ok)
            throw new common_1.BadRequestException("Propriété inconnue pour ce compte Google");
        await this.conn.updateOne({}, { site });
        this.cache.clear();
        return { ok: true, site };
    }
    /** Statut d'indexation réel d'une URL (URL Inspection API) */
    async inspect(url) {
        const c = await this.conn.findOne();
        if (!c)
            throw new common_1.UnauthorizedException("Search Console n'est pas connecté");
        const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
            method: "POST", headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json" },
            body: JSON.stringify({ inspectionUrl: url, siteUrl: c.site }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok)
            throw new common_1.BadGatewayException(j.error?.message ?? "Inspection impossible");
        const r = j.inspectionResult?.indexStatusResult ?? {};
        return { state: r.coverageState ?? "Unknown", verdict: r.verdict ?? "", lastCrawl: r.lastCrawlTime ?? null };
    }
    async disconnect() { await this.conn.deleteMany(); this.access = undefined; this.cache.clear(); return { ok: true }; }
    async accessToken() {
        if (this.access && this.access.exp > Date.now() + 30_000)
            return this.access.token;
        const c = await this.conn.findOne().select("+refreshToken");
        if (!c)
            throw new common_1.UnauthorizedException("Search Console n'est pas connecté");
        try {
            const t = await this.token({ grant_type: "refresh_token", refresh_token: (0, crypto_1.decrypt)(c.refreshToken, this.secret) });
            this.access = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 };
            return t.access_token;
        }
        catch (e) {
            if (e.code === "invalid_grant") {
                await this.disconnect();
                throw new common_1.UnauthorizedException("Accès Google révoqué — reconnectez Search Console");
            }
            throw new common_1.BadGatewayException(e.message);
        }
    }
    async query(site, body) {
        const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
            method: "POST", headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok)
            throw new common_1.BadGatewayException(j.error?.message ?? "Erreur Search Console (ce compte a-t-il accès à la propriété ?)");
        return j.rows ?? [];
    }
    /** Performance sur N jours (les données GSC ont ~2 jours de retard). Cache 10 min. */
    async performance(days) {
        if (![7, 28, 90, 365].includes(days))
            throw new common_1.BadRequestException("days doit valoir 7, 28, 90 ou 365");
        const key = `perf:${days}`;
        const hit = this.cache.get(key);
        if (hit && hit.exp > Date.now())
            return hit.data;
        const c = await this.conn.findOne();
        if (!c)
            throw new common_1.UnauthorizedException("Search Console n'est pas connecté");
        const end = new Date(Date.now() - 2 * 864e5), start = new Date(end.getTime() - (days - 1) * 864e5);
        const filter = this.cfg.get("GSC_PAGE_FILTER"); // ex. "/blog" pour ne suivre que le blog
        const base = { startDate: day(start), endDate: day(end), ...(filter && { dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: filter }] }] }) };
        const map = (r) => ({ key: r.keys?.[0] ?? "", clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
        const pEnd = new Date(start.getTime() - 864e5), pStart = new Date(pEnd.getTime() - (days - 1) * 864e5);
        const prevBase = { ...base, startDate: day(pStart), endDate: day(pEnd) };
        const [tot, series, queries, pages, devices, prev] = await Promise.all([
            this.query(c.site, base),
            this.query(c.site, { ...base, dimensions: ["date"], rowLimit: 400 }),
            this.query(c.site, { ...base, dimensions: ["query"], rowLimit: 250 }),
            this.query(c.site, { ...base, dimensions: ["page"], rowLimit: 250 }),
            this.query(c.site, { ...base, dimensions: ["device"], rowLimit: 5 }),
            this.query(c.site, prevBase),
        ]);
        const data = {
            range: { start: base.startDate, end: base.endDate, days }, site: c.site,
            totals: tot[0] ? { clicks: tot[0].clicks, impressions: tot[0].impressions, ctr: tot[0].ctr, position: tot[0].position } : { clicks: 0, impressions: 0, ctr: 0, position: 0 },
            series: series.map(map), queries: queries.map(map), pages: pages.map(map), devices: devices.map(map),
            previous: { clicks: prev[0]?.clicks ?? 0, impressions: prev[0]?.impressions ?? 0 },
        };
        this.cache.set(key, { exp: Date.now() + 10 * 60_000, data });
        return data;
    }
};
exports.GscService = GscService;
exports.GscService = GscService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(gsc_schema_1.GscConnection.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        config_1.ConfigService,
        jwt_1.JwtService])
], GscService);
