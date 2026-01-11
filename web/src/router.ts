import { renderJobs } from "./views/jobs";
import { renderJobDetail } from "./views/job-detail";
import { renderFaq } from "./views/faq";
import { renderResources } from "./views/resources";

type RouteHandler = (params: Record<string, string>) => Promise<void> | void;

interface Route {
  pattern: RegExp;
  handler: RouteHandler;
}

const routes: Route[] = [
  { pattern: /^#?\/?$/, handler: renderJobs },
  { pattern: /^#?\/jobs\/?$/, handler: renderJobs },
  { pattern: /^#?\/jobs\/(.+)$/, handler: (p) => renderJobDetail(p.id) },
  { pattern: /^#?\/faq\/?$/, handler: renderFaq },
  { pattern: /^#?\/resources\/?$/, handler: renderResources },
];

function getApp(): HTMLElement {
  const app = document.getElementById("app");
  if (!app) throw new Error("No #app element found");
  return app;
}

async function handleRoute(): Promise<void> {
  const hash = window.location.hash || "#/";
  const app = getApp();

  for (const route of routes) {
    const match = hash.match(route.pattern);
    if (match) {
      // Extract named params from regex groups
      const params: Record<string, string> = {};
      if (match[1]) params.id = match[1];

      // Show loading state
      app.innerHTML = '<p aria-busy="true">Loading...</p>';

      try {
        await route.handler(params);
      } catch (error) {
        console.error("Route error:", error);
        app.innerHTML = `<article><p>Error loading page. Please try again.</p></article>`;
      }
      return;
    }
  }

  // 404
  app.innerHTML = `
    <article>
      <h2>Page Not Found</h2>
      <p>The page you're looking for doesn't exist.</p>
      <a href="#/jobs">Browse Jobs</a>
    </article>
  `;
}

export function initRouter(): void {
  // Handle initial route
  handleRoute();

  // Handle hash changes
  window.addEventListener("hashchange", handleRoute);
}

export function navigate(path: string): void {
  window.location.hash = path;
}
