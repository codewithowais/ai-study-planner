"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MockReview, type MockReviewQ } from "@/components/mock-review";
import { api, ApiError } from "@/lib/client";
import { prettyDate } from "@/lib/plan-dates";

interface AttemptResp {
  courseId: string;
  courseTitle: string;
  score: number;
  correctCount: number;
  total: number;
  takenAt: string;
  results: MockReviewQ[];
}

export default function MockReviewPage() {
  const { courseId, attemptId } = useParams<{ courseId: string; attemptId: string }>();
  const [data, setData] = useState<AttemptResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AttemptResp>(
        `/api/mock/attempt?courseId=${encodeURIComponent(courseId)}&attemptId=${encodeURIComponent(attemptId)}`
      )
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load this review."));
  }, [courseId, attemptId]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="font-medium">{error}</p>
            <Button asChild variant="outline">
              <Link href="/progress">
                <ArrowLeft className="h-4 w-4" />
                Back to progress
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Mock exam review"
        description={`${data.courseTitle} · ${prettyDate(data.takenAt.slice(0, 10))}`}
      />
      <MockReview
        courseId={data.courseId}
        score={data.score}
        correctCount={data.correctCount}
        total={data.total}
        results={data.results}
        actions={
          <Button asChild variant="outline">
            <Link href="/progress">
              <ArrowLeft className="h-4 w-4" />
              Back to progress
            </Link>
          </Button>
        }
      />
    </div>
  );
}
