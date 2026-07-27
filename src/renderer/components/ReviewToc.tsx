import { useEffect, useMemo, useState } from "react";
import type { ReviewGroup } from "../../shared/contracts";

export function ReviewToc({ groups }: { groups: ReviewGroup[] }) {
  const entries = useMemo(
    () => [
      { id: "review-summary", label: "レビュー要約", number: "00" },
      ...groups.map((group, index) => ({
        id: `review-group-${index + 1}`,
        label: group.title,
        number: String(index + 1).padStart(2, "0"),
      })),
    ],
    [groups],
  );
  const [activeId, setActiveId] = useState(entries[0]?.id ?? "review-summary");

  useEffect(() => {
    const scrollRoot = document.querySelector<HTMLElement>(".main-pane");
    const sections = entries.flatMap((entry) => {
      const element = document.getElementById(entry.id);
      return element ? [element] : [];
    });
    if (!scrollRoot || sections.length === 0) return;

    const observer = new IntersectionObserver(
      (observedEntries) => {
        const visibleEntry = observedEntries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              Math.abs(left.boundingClientRect.top) -
              Math.abs(right.boundingClientRect.top),
          )[0];
        if (visibleEntry?.target.id) setActiveId(visibleEntry.target.id);
      },
      {
        root: scrollRoot,
        rootMargin: "-104px 0px -68% 0px",
        threshold: 0,
      },
    );

    sections.forEach((section) => {
      observer.observe(section);
    });
    return () => observer.disconnect();
  }, [entries]);

  return (
    <aside className="review-toc" aria-label="レビューの目次">
      <div className="review-toc__heading">
        <span>目次</span>
        <span>{String(entries.length).padStart(2, "0")}</span>
      </div>
      <nav>
        {entries.map((entry) => {
          const active = activeId === entry.id;
          return (
            <button
              aria-current={active ? "location" : undefined}
              className={active ? "is-active" : ""}
              key={entry.id}
              onClick={() => {
                setActiveId(entry.id);
                document.getElementById(entry.id)?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              type="button"
            >
              <span>{entry.number}</span>
              <strong>{entry.label}</strong>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
