export function LoadingWorkspace() {
  return (
    <div className="workspace workspace--loading" aria-label="レビューを読み込み中">
      <div className="skeleton skeleton--kicker" />
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--path" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton--stat" />
        <div className="skeleton skeleton--stat" />
        <div className="skeleton skeleton--stat" />
      </div>
      <div className="skeleton skeleton--body" />
    </div>
  );
}
