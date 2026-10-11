import { Component, lazy, useState, type ComponentType, type ComponentProps, type ReactNode } from "react";
import { Button } from "../components/ui";

class ModuleErrorBoundary extends Component<{
  children: ReactNode;
  name: string;
  onRetry: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return (
      <div role="alert">
        <p>Could not open {this.props.name}. Check your connection and try again.</p>
        <Button onClick={this.props.onRetry}>Retry {this.props.name}</Button>
      </div>
    );
    return this.props.children;
  }
}

/** Retry with a fresh lazy component so a rejected import cannot poison later attempts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Matches React.lazy while retaining each component's inferred props.
export function recoverableLazy<C extends ComponentType<any>>(
  load: () => Promise<{ default: C }>,
  name: string,
) {
  let CachedModule = lazy(load);
  return function RecoverableLazyModule(props: ComponentProps<C>) {
    const [attempt, setAttempt] = useState(() => ({ id: 0, Module: CachedModule }));
    const Module = attempt.Module as ComponentType<ComponentProps<C>>;
    return (
      <ModuleErrorBoundary
        key={attempt.id}
        name={name}
        onRetry={() => {
          CachedModule = lazy(load);
          setAttempt({ id: attempt.id + 1, Module: CachedModule });
        }}
      >
        <Module {...props} />
      </ModuleErrorBoundary>
    );
  };
}
