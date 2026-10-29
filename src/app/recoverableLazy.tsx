import {
  Component,
  lazy,
  useState,
  type ComponentType,
  type ComponentProps,
  type ReactNode,
} from "react";
import styles from "./recoverableLazy.module.css";

class ModuleErrorBoundary extends Component<
  {
    children: ReactNode;
    name: string;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed)
      return (
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
  let loaded: C | null = null;
  const remember = () =>
    load().then((module) => {
      loaded = module.default;
      return module;
    });
  const Module = lazy(remember) as unknown as ComponentType<ComponentProps<C>>;
  function RecoverableLazyModule(props: ComponentProps<C>) {
    // React 19 holds a Suspense reveal for ~300 ms after its fallback commits, so a module
    // that is already downloaded renders directly. The type is fixed per mount to keep state.
    const [Resolved] = useState<ComponentType<ComponentProps<C>>>(() => loaded ?? Module);
    return (
      <ModuleErrorBoundary name={name}>
        <Resolved {...props} />
      </ModuleErrorBoundary>
    );
  }
  /** Downloads the module ahead of use; later mounts then render without suspending. */
  RecoverableLazyModule.preload = (): Promise<void> =>
    loaded ? Promise.resolve() : remember().then(() => undefined);
  return RecoverableLazyModule;
}
