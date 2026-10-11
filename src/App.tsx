import { Viewport } from './scene/Viewport';
import { Interface } from './ui/Interface';
import { Loader } from './ui/Loader';

export default function App() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-graphite-950 text-paper">
      <Viewport />
      <Interface />
      <Loader />
    </div>
  );
}
