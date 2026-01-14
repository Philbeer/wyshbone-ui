/**
 * Component Status Component
 * Shows status of all major components/features in the system
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, FileCode } from 'lucide-react';
import { ComponentStatus as ComponentStatusType } from '@/services/devProgressService';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface Props {
  components: ComponentStatusType[];
}

export function ComponentStatus({ components }: Props) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'partial':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'in-progress':
        return <Loader2 className="h-5 w-5 text-primary" />;
      case 'missing':
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <XCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return <Badge className="bg-green-500">Complete</Badge>;
      case 'partial':
        return <Badge variant="secondary">Partial</Badge>;
      case 'in-progress':
        return <Badge>In Progress</Badge>;
      case 'missing':
        return <Badge variant="destructive">Missing</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      UI: 'bg-blue-500',
      Supervisor: 'bg-purple-500',
      Tower: 'bg-orange-500',
      All: 'bg-gray-500',
    };
    return (
      <Badge className={`${colors[category] || 'bg-gray-500'} text-white`}>
        {category}
      </Badge>
    );
  };

  // Group components by category
  const groupedComponents = components.reduce((acc, component) => {
    if (!acc[component.category]) {
      acc[component.category] = [];
    }
    acc[component.category].push(component);
    return acc;
  }, {} as Record<string, ComponentStatusType[]>);

  return (
    <div className="space-y-6">
      {Object.entries(groupedComponents).map(([category, categoryComponents]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getCategoryBadge(category)}
              <span>{category} Components</span>
            </CardTitle>
            <CardDescription>
              {categoryComponents.length} components in this category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="space-y-2">
              {categoryComponents.map((component) => (
                <AccordionItem
                  key={component.id}
                  value={component.id}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3 flex-1 text-left">
                      {getStatusIcon(component.status)}
                      <span className="font-medium flex-1">{component.name}</span>
                      {getStatusBadge(component.status)}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2 pb-4">
                    <div className="space-y-3 pl-7">
                      <p className="text-sm text-muted-foreground">
                        {component.description}
                      </p>

                      {component.files && component.files.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium mb-2">Files:</h5>
                          <div className="space-y-1">
                            {component.files.map((file) => (
                              <div key={file} className="flex items-center gap-2 text-xs font-mono">
                                <FileCode className="h-3 w-3 text-muted-foreground" />
                                <span className="text-muted-foreground">{file}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {component.issues && component.issues.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-destructive mb-2">Issues:</h5>
                          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                            {component.issues.map((issue, i) => (
                              <li key={i}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {component.lastUpdated && (
                        <p className="text-xs text-muted-foreground">
                          Last updated: {component.lastUpdated}
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
