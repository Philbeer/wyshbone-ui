/**
 * Video Tutorial Modal Component
 * Displays embedded video tutorials in a modal dialog
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface VideoTutorial {
  id: string;
  title: string;
  description?: string;
  videoUrl: string; // YouTube embed URL or other video URL
  duration?: string; // e.g., "2:30"
}

interface VideoTutorialModalProps {
  tutorial: VideoTutorial | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VideoTutorialModal({ tutorial, open, onOpenChange }: VideoTutorialModalProps) {
  if (!tutorial) return null;

  // Extract video ID from YouTube URL if needed
  const getEmbedUrl = (url: string): string => {
    // If already an embed URL, return as is
    if (url.includes("/embed/")) {
      return url;
    }

    // Convert standard YouTube URL to embed URL
    if (url.includes("youtube.com/watch")) {
      const urlParams = new URLSearchParams(url.split("?")[1]);
      const videoId = urlParams.get("v");
      return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }

    // Convert short YouTube URL to embed URL
    if (url.includes("youtu.be/")) {
      const videoId = url.split("youtu.be/")[1].split("?")[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }

    return url;
  };

  const embedUrl = getEmbedUrl(tutorial.videoUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tutorial.title}
            {tutorial.duration && (
              <span className="text-sm font-normal text-muted-foreground">
                ({tutorial.duration})
              </span>
            )}
          </DialogTitle>
          {tutorial.description && (
            <DialogDescription>{tutorial.description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
          {/* 16:9 aspect ratio */}
          <iframe
            src={embedUrl}
            title={tutorial.title}
            className="absolute top-0 left-0 w-full h-full rounded-md"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sample tutorial data structure
 * Replace with actual video URLs when ready
 */
export const tutorialLibrary: Record<string, VideoTutorial> = {
  gettingStarted: {
    id: "getting-started",
    title: "Getting Started with Wyshbone",
    description: "Learn the basics and set up your workspace",
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Placeholder
    duration: "2:00",
  },
  addingCustomers: {
    id: "adding-customers",
    title: "Adding Your First Customer",
    description: "Quick guide to adding and managing customers",
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Placeholder
    duration: "1:30",
  },
  creatingOrders: {
    id: "creating-orders",
    title: "Creating Orders and Tracking Revenue",
    description: "Learn how to create orders and monitor sales",
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Placeholder
    duration: "2:15",
  },
  usingChat: {
    id: "using-chat",
    title: "Using the AI Chat Assistant",
    description: "Discover how Claude can help you find leads and insights",
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Placeholder
    duration: "2:00",
  },
};
