import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';

export default function NotFoundPage() {
  return <EmptyState title="Page not found" message="The page you are looking for does not exist." action={<Link to="/"><Button>Go to dashboard</Button></Link>} />;
}
