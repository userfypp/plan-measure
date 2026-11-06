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
        <div className={styles.skeletonBar} />
        <div className={styles.skeletonButton} />
      </header>
      <div className={styles.controls}>
        <div className={styles.goTo}>
          <div className={styles.skeletonLabel} />
          <div className={styles.skeletonField} />
        </div>
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
