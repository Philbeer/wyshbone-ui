/**
 * User Preferences Page
 *
 * Displays learned preferences from user feedback and task outcomes
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, MapPin, Users, Tag } from 'lucide-react';

// ========================================
// TYPES
// ========================================

interface PreferenceItem {
  value: string;
  weight: number;
  engagementCount: number;
  lastEngaged: number;
}

interface UserPreferences {
  industries: PreferenceItem[];
  regions: PreferenceItem[];
  contactTypes: PreferenceItem[];
  keywords: PreferenceItem[];
}

// ========================================
// COMPONENT
// ========================================

export default function Preferences() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get session ID from localStorage
      const sessionId = localStorage.getItem('sessionId');
      if (!sessionId) {
        throw new Error('No session ID found');
      }

      // Fetch preferences from supervisor API
      const response = await fetch(`${import.meta.env.VITE_SUPERVISOR_URL || 'http://localhost:3000'}/api/preferences`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load preferences: ${response.statusText}`);
      }

      const data = await response.json();
      setPreferences(data.preferences);
    } catch (err: any) {
      console.error('[PREFERENCES] Error loading preferences:', err);
      setError(err.message || 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  // Render preference strength indicator
  const renderStrength = (weight: number) => {
    const strength = Math.round(weight * 100);
    const color = weight > 0.7 ? 'bg-green-500' : weight > 0.4 ? 'bg-yellow-500' : 'bg-gray-400';

    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${strength}%` }} />
        </div>
        <span className="text-xs text-gray-500">{strength}%</span>
      </div>
    );
  };

  // Render loading state
  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">User Preferences</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">User Preferences</h1>
        <Card>
          <CardContent className="p-6">
            <p className="text-red-500">Error: {error}</p>
            <button
              onClick={loadPreferences}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render preferences
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Your Learned Preferences</h1>
        <p className="text-gray-600 mt-2">
          These preferences are learned from your interactions and feedback over time.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Industries */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              <CardTitle>Industries</CardTitle>
            </div>
            <CardDescription>
              {preferences?.industries.length || 0} industry preferences learned
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preferences?.industries.length === 0 ? (
              <p className="text-gray-500 text-sm">No industry preferences yet</p>
            ) : (
              <div className="space-y-3">
                {preferences?.industries.slice(0, 5).map((pref, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium capitalize">{pref.value}</p>
                      <p className="text-xs text-gray-500">{pref.engagementCount} interactions</p>
                    </div>
                    {renderStrength(pref.weight)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Regions */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-green-500" />
              <CardTitle>Regions</CardTitle>
            </div>
            <CardDescription>
              {preferences?.regions.length || 0} location preferences learned
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preferences?.regions.length === 0 ? (
              <p className="text-gray-500 text-sm">No region preferences yet</p>
            ) : (
              <div className="space-y-3">
                {preferences?.regions.slice(0, 5).map((pref, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium capitalize">{pref.value}</p>
                      <p className="text-xs text-gray-500">{pref.engagementCount} interactions</p>
                    </div>
                    {renderStrength(pref.weight)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact Types */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-500" />
              <CardTitle>Contact Types</CardTitle>
            </div>
            <CardDescription>
              {preferences?.contactTypes.length || 0} contact type preferences learned
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preferences?.contactTypes.length === 0 ? (
              <p className="text-gray-500 text-sm">No contact type preferences yet</p>
            ) : (
              <div className="space-y-3">
                {preferences?.contactTypes.slice(0, 5).map((pref, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium capitalize">{pref.value}</p>
                      <p className="text-xs text-gray-500">{pref.engagementCount} interactions</p>
                    </div>
                    {renderStrength(pref.weight)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Keywords */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-orange-500" />
              <CardTitle>Keywords</CardTitle>
            </div>
            <CardDescription>
              {preferences?.keywords.length || 0} keyword preferences learned
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preferences?.keywords.length === 0 ? (
              <p className="text-gray-500 text-sm">No keyword preferences yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {preferences?.keywords.slice(0, 10).map((pref, i) => (
                  <Badge key={i} variant="secondary" className="text-sm">
                    {pref.value}
                    <span className="ml-1 text-xs opacity-60">
                      {Math.round(pref.weight * 100)}%
                    </span>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent className="p-6">
          <p className="text-sm text-gray-600">
            <strong>How preferences work:</strong> As you interact with tasks and provide feedback,
            the agent learns your preferences. Higher percentages indicate stronger preferences.
            These preferences influence which tasks the agent prioritizes for you.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
