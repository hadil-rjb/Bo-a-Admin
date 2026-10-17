import { ApiError, request } from "../http";
import { blob, Env, Linked, OAuthProvider, PublishInput } from "./types";

/**
 * Meta (one app for both): Facebook Pages and Instagram professional accounts linked to a Page.
 * Long-lived user token → Page tokens (do not expire). Instagram downloads images from their public URL,
 * so PUBLIC_API_URL must be reachable from the internet.
 */
const SETUP = [
  "Create a Business app at developers.facebook.com and add the “Facebook Login for Business” product.",
  "App settings → Basic: add the domain below to App Domains, then Add platform → Website with the site URL below (Facebook refuses sign-ins from domains that aren't listed). Save.",
  "Facebook Login for Business → Settings: turn on Client OAuth login and Web OAuth login, and add both callback URLs below (Facebook and Instagram) under Valid OAuth Redirect URIs. Save.",
  "Copy the App ID and App Secret into META_APP_ID and META_APP_SECRET, then restart the API.",
];

function graph(env: Env) {
  const v = env("META_GRAPH_VERSION") || "v23.0";
  const base = (env("META_GRAPH_URL") || "https://graph.facebook.com").replace(/\/$/, "") + "/" + v;
  const dialog = (env("META_OAUTH_URL") || "https://www.facebook.com").replace(/\/$/, "") + `/${v}/dialog/oauth`;
  const get = (path: string, q: Record<string, string>) => request(`${base}${path}?${new URLSearchParams(q)}`);
  const post = (path: string, q: Record<string, string>, body?: FormData) =>
    body ? request(`${base}${path}?${new URLSearchParams(q)}`, { method: "POST", body, timeoutMs: 90_000 }) : request(`${base}${path}`, { method: "POST", form: q, timeoutMs: 90_000 });
  return { base, dialog, get, post };
}

async function userToken(env: Env, code: string, redirectUri: string) {
  const g = graph(env), app = { client_id: env("META_APP_ID")!, client_secret: env("META_APP_SECRET")! };
  const short = await g.get("/oauth/access_token", { ...app, redirect_uri: redirectUri, code });
  const long = await g.get("/oauth/access_token", { ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token }).catch(() => short);
  return long.access_token as string;
}

const pagesOf = (env: Env, token: string) =>
  graph(env).get("/me/accounts", {
    access_token: token,
    fields: "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
    limit: "100",
  }).then((r) => (r.data || []) as any[]);

const authorize = (env: Env, scope: string) => ({ state, redirectUri }: { state: string; redirectUri: string }) =>
  `${graph(env).dialog}?${new URLSearchParams({ client_id: env("META_APP_ID")!, redirect_uri: redirectUri, state, scope, response_type: "code" })}`;

export function facebook(env: Env): OAuthProvider {
  return {
    net: "fb",
    name: "Facebook",
    kind: "oauth",
    env: ["META_APP_ID", "META_APP_SECRET"],
    setup: [...SETUP, "Permissions used: pages_show_list, pages_manage_posts, pages_read_engagement."],
    authorizeUrl: authorize(env, "pages_show_list,pages_manage_posts,pages_read_engagement"),

    async exchange({ code, redirectUri }) {
      const pages = await pagesOf(env, await userToken(env, code, redirectUri));
      const p = pages[0];
      if (!p) throw new ApiError("No Facebook Page found. Connect with an account that manages a Page.");
      return {
        tokens: { accessToken: p.access_token },
        account: { id: p.id, name: p.name, avatar: p.picture?.data?.url, url: `https://www.facebook.com/${p.id}` },
        extra: { pageId: p.id, pages: pages.map((x) => ({ id: x.id, name: x.name })) },
      };
    },

    async publish(link: Linked, input: PublishInput) {
      const g = graph(env), token = link.tokens.accessToken, page = link.extra.pageId;
      const photo = (im: PublishInput["images"][number], extra: Record<string, string>) => {
        const f = new FormData();
        f.append("source", blob(im.buffer, im.mime), "slide.jpg");
        return g.post(`/${page}/photos`, { access_token: token, ...extra }, f);
      };
      let postId: string;
      if (input.images.length === 1) {
        const r = await photo(input.images[0], { caption: input.text });
        postId = r.post_id || r.id;
      } else {
        const ids: string[] = [];
        for (const im of input.images.slice(0, 30)) ids.push((await photo(im, { published: "false" })).id);
        const q: Record<string, string> = { access_token: token, message: input.text };
        ids.forEach((id, i) => (q[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
        postId = (await g.post(`/${page}/feed`, q)).id;
      }
      let warning: string | undefined;
      if (input.firstComment?.trim()) {
        await g.post(`/${postId}/comments`, { access_token: token, message: input.firstComment.trim() }).catch((e) => { warning = `Posted, but the first comment failed: ${e.message}`; });
      }
      return { id: postId, url: `https://www.facebook.com/${postId}`, warning };
    },
  };
}

export function instagram(env: Env): OAuthProvider {
  const waitReady = async (id: string, token: string) => {
    for (let i = 0; i < 20; i++) {
      const s = await graph(env).get(`/${id}`, { access_token: token, fields: "status_code,status" });
      if (s.status_code === "FINISHED" || !s.status_code) return;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new ApiError(`Instagram could not process the image (${s.status || s.status_code})`);
      await new Promise((r) => setTimeout(r, Number(env("META_POLL_MS") || 3000)));
    }
    throw new ApiError("Instagram is still processing the images. Try again in a minute.");
  };
  return {
    net: "ig",
    name: "Instagram",
    kind: "oauth",
    env: ["META_APP_ID", "META_APP_SECRET"],
    setup: [
      ...SETUP,
      "The Instagram account must be a Business or Creator account linked to a Facebook Page.",
      "Permissions used: instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement, business_management.",
      "PUBLIC_API_URL must be a public https address: Instagram downloads the images from it.",
    ],
    authorizeUrl: authorize(env, "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management"),

    async exchange({ code, redirectUri }) {
      const pages = (await pagesOf(env, await userToken(env, code, redirectUri))).filter((p) => p.instagram_business_account);
      const p = pages[0];
      if (!p) throw new ApiError("No Instagram professional account is linked to your Facebook Pages.");
      const ig = p.instagram_business_account;
      return {
        tokens: { accessToken: p.access_token },
        account: { id: ig.id, name: ig.name || ig.username, handle: "@" + ig.username, avatar: ig.profile_picture_url, url: `https://www.instagram.com/${ig.username}` },
        extra: { igUserId: ig.id, pageId: p.id, accounts: pages.map((x) => ({ id: x.instagram_business_account.id, username: x.instagram_business_account.username })) },
      };
    },

    async publish(link: Linked, input: PublishInput) {
      const g = graph(env), token = link.tokens.accessToken, ig = link.extra.igUserId;
      if (!input.images.length) throw new ApiError("Instagram posts need at least one image");
      if (/^https?:\/\/(localhost|127\.|\[::1\])/.test(input.images[0].url) && !env("META_ALLOW_LOCAL_URLS")) {
        throw new ApiError("Instagram must download the images: set PUBLIC_API_URL to a public https address");
      }
      const imgs = input.images.slice(0, 10);
      let creation: string;
      if (input.story) {
        creation = (await g.post(`/${ig}/media`, { access_token: token, media_type: "STORIES", image_url: imgs[0].url })).id;
      } else if (imgs.length === 1) {
        creation = (await g.post(`/${ig}/media`, { access_token: token, image_url: imgs[0].url, caption: input.text })).id;
      } else {
        const children: string[] = [];
        for (const im of imgs) children.push((await g.post(`/${ig}/media`, { access_token: token, image_url: im.url, is_carousel_item: "true" })).id);
        for (const c of children) await waitReady(c, token);
        creation = (await g.post(`/${ig}/media`, { access_token: token, media_type: "CAROUSEL", children: children.join(","), caption: input.text })).id;
      }
      await waitReady(creation, token);
      const media = (await g.post(`/${ig}/media_publish`, { access_token: token, creation_id: creation })).id;
      const info = await g.get(`/${media}`, { access_token: token, fields: "permalink" }).catch(() => ({}) as any);
      let warning: string | undefined = input.story && input.text.trim() ? "Stories don't show captions: only the image was posted" : undefined;
      if (input.firstComment?.trim() && !input.story) {
        await g.post(`/${media}/comments`, { access_token: token, message: input.firstComment.trim() }).catch((e) => { warning = `Posted, but the first comment failed: ${e.message}`; });
      }
      return { id: media, url: info.permalink, warning };
    },
  };
}
