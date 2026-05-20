// LinkedEntityTrailSection — entity trail placeholder (Slice 4 wires real nodes).

import * as React from 'react';
import { PanelSectionTitle, LinkedEntityTrail } from '@fops/ui';

export function LinkedEntityTrailSection(): React.ReactElement {
  return (
    <div>
      <PanelSectionTitle>관련 엔티티</PanelSectionTitle>
      {/* Slice 3: always empty — Slice 4 wires real nodes */}
      <LinkedEntityTrail nodes={[]} />
    </div>
  );
}
