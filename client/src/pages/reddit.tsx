import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RedditPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Reddit Integration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Reddit monitoring features coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
