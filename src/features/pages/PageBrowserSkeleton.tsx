import styles from "./PageBrowser.module.css";

/**
 * Suspense fallback while the lazy PageBrowser chunk loads. It reuses the real panel box and
 * header so the final size never changes; the content is flat placeholders, with no loading text
 * visible and no animation.
 */
export function PageBrowserSkeleton() {
  return (
    <aside
      className={styles.panel}
      aria-busy="true"
      aria-label="Pages"
      data-page-browser
      data-page-browser-skeleton
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2>Pages</h2>
        </div>
      </header>
      <div className={styles.controls}>
        <div className={styles.skeletonBar} />
        <div className={styles.skeletonBar} />
      </div>
      <div className={styles.skeletonList}>
        <div className={styles.skeletonThumbnail} />
        <div className={styles.skeletonThumbnail} />
        <div className={styles.skeletonThumbnail} />
      </div>
      <span role="status" className={styles.srOnly}>
        Loading pages
      </span>
    </aside>
  );
}
