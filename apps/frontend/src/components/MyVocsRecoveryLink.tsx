import { GLOSSARY } from '@/lib/copy/glossary';
import { Button } from '@fops/ui';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

/**
 * The single blocked-state recovery affordance (#1264): permission-blocked
 * screens that offer a reporter detour link to 내 VOC with this one Button.
 */
export function MyVocsRecoveryLink() {
  return (
    <Button asChild variant="secondary" size="sm" spacing="compact">
      <Link to="/vocs" search={{ view: 'my' }}>
        {GLOSSARY.myVocs}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </Button>
  );
}
