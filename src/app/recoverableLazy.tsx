import { Component, lazy, type ComponentType, type ComponentProps, type ReactNode } from "react";
import styles from "./recoverableLazy.module.css";

class ModuleErrorBoundary extends Component<{
  children: ReactNode;
  name: string;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return (
      <div role="alert" className={styles.error}>
        <p className={styles.title}>Could not open {this.props.name}</p>
        <p className={styles.message}>Reload the page to try again.</p>
      </div>
    );
    return this.props.children;
  }
}

/** Isolates a rejected lazy import so the rest of the app keeps its state; recovery is a page reload. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Matches React.lazy while retaining each component's inferred props.
export function recoverableLazy<C extends ComponentType<any>>(
  load: () => Promise<{ default: C }>,
  name: string,
) {
  const Module = lazy(load) as unknown as ComponentType<ComponentProps<C>>;
  return function RecoverableLazyModule(props: ComponentProps<C>) {
    return (
      <ModuleErrorBoundary name={name}>
        <Module {...props} />
      </ModuleErrorBoundary>
    );
  };
}
