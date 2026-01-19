import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2 } from "lucide-react";
import { useUser } from "@/contexts/UserContext";

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateOrgDialog({ open, onOpenChange, onSuccess }: CreateOrgDialogProps) {
  const { sessionId } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = useState("");

  const createOrgMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/org/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId || "",
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create organisation");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Organisation created",
        description: `Welcome to ${data.org.name}! You are now an admin.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/org/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setOrgName("");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (orgName.trim()) {
      createOrgMutation.mutate(orgName.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Create Organisation
          </DialogTitle>
          <DialogDescription>
            Create your organisation to start inviting team members and collaborating.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">Organisation Name</Label>
            <Input
              id="orgName"
              placeholder="My Company Ltd"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
            />
            <p className="text-sm text-muted-foreground">
              This is usually your company or team name.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createOrgMutation.isPending || !orgName.trim()}>
              {createOrgMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Building2 className="h-4 w-4 mr-2" />
              )}
              Create Organisation
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
