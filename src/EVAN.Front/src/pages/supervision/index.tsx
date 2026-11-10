/** Supervision : l'usine en temps réel, la phrase du moment avec ses repères, et les pannes en cours. */
import { useProject } from '@/store/project';
import { Zone } from '@/widgets/shell/zones';
import { SupervisionKpis } from './features/SupervisionKpis';
import { SupervisionPanel } from './features/SupervisionPanel';
import './index.css';

export function SupervisionPage() {
  // Une instance par usine : la tendance du TRS et la cadence ne mélangent pas deux usines.
  const activeId = useProject((s) => s.activeId);
  return (
    <>
      <Zone nom="bandeau">
        <SupervisionKpis key={activeId} />
      </Zone>
      <Zone nom="panneau">
        <SupervisionPanel />
      </Zone>
    </>
  );
}
