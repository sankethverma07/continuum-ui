import { useHydration } from '@continuum/hooks/useHydration';
import { ContinuumIngestDemo } from './pages/ContinuumIngestDemo';
import { PhoneProductPage } from './pages/PhoneProductPage';
import { SemanticComparePage } from './pages/SemanticComparePage';
import { LatencyComparePage } from './pages/LatencyComparePage';
import { WatchShowcasePage } from './pages/WatchShowcasePage';
import { AutoCatalogPage } from './pages/AutoCatalogPage';
import { LoadingStrategyComparePage } from './pages/LoadingStrategyComparePage';
import { ProxyDemoPage } from './pages/ProxyDemoPage';
import { ScenesDemoPage } from './pages/ScenesDemoPage';
import { CloudDemoPage } from './pages/CloudDemoPage';
import { BenchmarkPage } from './pages/BenchmarkPage';
import { DemoSwitcher } from './router/DemoSwitcher';
import { useHashRoute } from './router/useHashRoute';

export const App = () => {
  // Boot the agentic hydrator at app root so every surface sees the same policy.
  useHydration();

  const route = useHashRoute();

  return (
    <>
      <DemoSwitcher />
      {route === 'demo'    && <ContinuumIngestDemo />}
      {route === 'phone'   && <PhoneProductPage />}
      {route === 'compare' && <SemanticComparePage />}
      {route === 'latency' && <LatencyComparePage />}
      {route === 'watch'   && <WatchShowcasePage />}
      {route === 'auto'    && <AutoCatalogPage />}
      {route === 'ab'      && <LoadingStrategyComparePage />}
      {route === 'proxy'   && <ProxyDemoPage />}
      {route === 'scenes'  && <ScenesDemoPage />}
      {route === 'cloud'   && <CloudDemoPage />}
      {route === 'benchmark' && <BenchmarkPage />}
    </>
  );
};
