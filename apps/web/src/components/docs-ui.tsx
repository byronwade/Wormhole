import Link from "next/link";
import { cn } from "@/lib/utils";

type Crumb = { label: string; href?: string };

export function DocsHeader({
  title,
  description,
  lead,
  crumb,
  crumbs,
}: {
  title: string;
  description?: string;
  /** Alias for description */
  lead?: string;
  crumb?: { label: string; href: string };
  crumbs?: Crumb[];
}) {
  const blurb = description ?? lead ?? "";
  const trail: Crumb[] =
    crumbs ??
    (crumb
      ? [crumb, { label: title }]
      : []);

  return (
    <header className="docs-home__intro">
      {trail.length > 0 ? (
        <p className="docs-crumbtrail">
          {trail.map((item, i) => (
            <span key={`${item.label}-${i}`}>
              {i > 0 ? <span aria-hidden="true"> / </span> : null}
              {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
            </span>
          ))}
        </p>
      ) : null}
      <h1>{title}</h1>
      {blurb ? <p>{blurb}</p> : null}
    </header>
  );
}

export function DocsCode({ children }: { children: string }) {
  return (
    <pre className="docs-code" tabIndex={0}>
      <code>{children}</code>
    </pre>
  );
}

export function DocsNote({
  title,
  tone,
  children,
}: {
  title?: string;
  tone?: "info" | "warn";
  children: React.ReactNode;
}) {
  return (
    <aside
      className={cn("docs-note", tone === "warn" && "docs-note--warn")}
      role="note"
    >
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </aside>
  );
}

export function DocsTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="docs-table-wrap">
      <table className="docs-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocsLinkGrid({
  items,
}: {
  items: {
    title: string;
    description?: string;
    desc?: string;
    href: string;
  }[];
}) {
  return (
    <div className="docs-home__grid">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="docs-home__card">
          <h2>{item.title}</h2>
          <p>{item.description ?? item.desc}</p>
        </Link>
      ))}
    </div>
  );
}

export function DocsArticle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <article className={cn("docs-article", className)}>{children}</article>;
}
