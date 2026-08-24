import type { ReactNode } from "react";
import styles from "./SecondaryPanelHost.module.css";

export function SecondaryPanelHost({ children }: { children: ReactNode }) {
  return (
    <div
      className={styles.secondaryPanelHost}
      aria-label="Secondary workspace panel"
      data-layout-slot="secondary-panel"
    >
      {children}
    </div>
  );
}
