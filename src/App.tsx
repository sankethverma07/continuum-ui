import { useHydration } from '@continuum/hooks/useHydration';
// ── Chapter pages (story-ordered) ────────────────────────────────────
import { TheBriefPage }      from './pages/TheBriefPage';        // Ch 00
import { TheProblemPage }    from './pages/TheProblemPage';      // Ch 01
import { LatencyComparePage } from './pages/LatencyComparePage'; // Ch 02
import { LoadingStrategyComparePage } from './pages/LoadingStrategyComparePage'; // Ch 03
import { TheInsightPage }    from './pages/TheInsightPage';      // Ch 04
import { ProxyDemoPage }     from './pages/ProxyDemoPage';       // Ch 05
import { WatchShowcasePage } from './pages/WatchShowcasePage';   // Ch 06
import { SemanticComparePage } from './pages/SemanticComparePage'; // Ch 07
import { CloudDemoPage }     from './pages/CloudDemoPage';       // Ch 08
import { ScenesDemoPage }    from './pages/ScenesDemoPage';      // Ch 09
import { PhoneProductPage }  from './pages/PhoneProductPage';    // Ch 10
// ── Secondary routes (out of arc) ────────────────────────────────────
import { ContinuumIngestDemo } from './pages/ContinuumIngestDemo';
import { AutoCatalogPage }     from './pages/AutoCatalogPage';
import { BenchmarkPage }       from './pages/BenchmarkPage';
// ── Router ───────────────────────────────────────────────────────────
import { DemoSwitcher } from './router/DemoSwitcher';
import { useHashRoute } from './router/useHashRoute';

export const App = () => {
  // Boot the agentic hydrator at app root so every surface sees the same policy.
  useHydration();

  const route = useHashRoute();

  return (
    <>
      <DemoSwitcher />
      {/* Chapter arc */}
      {route === 'brief'   && <TheBriefPage />}
      {route === 'problem' && <TheProblemPage />}
      {route === 'latency' && <LatencyComparePage />}
      {route === 'ab'      && <LoadingStrategyComparePage />}
      {route === 'insight' && <TheInsightPage />}
      {route === 'proxy'   && <ProxyDemoPage />}
      {route === 'watch'   && <WatchShowcasePage />}
      {route === 'compare' && <SemanticComparePage />}
      {route === 'cloud'   && <CloudDemoPage />}
      {route === 'scenes'  && <ScenesDemoPage />}
      {route === 'phone'   && <PhoneProductPage />}
      {/* Secondary / utility */}
      {route === 'demo'      && <ContinuumIngestDemo />}
      {route === 'auto'      && <AutoCatalogPage />}
      {route === 'benchmark' && <BenchmarkPage />}
    </>
  );
};
