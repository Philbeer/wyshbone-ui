import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function InspectorPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/dev/afr');
  }, [setLocation]);

  return null;
}
