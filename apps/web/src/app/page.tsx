import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function Landing() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 bg-gradient-to-b from-background via-background to-muted/40">
      <div className="text-center space-y-3 max-w-xl">
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          UChicago Swim &amp; Dive · Live pulse
        </div>
        <h1 className="h-serif text-5xl md:text-6xl font-semibold tracking-tight text-primary">reflect-live</h1>
        <p className="text-muted-foreground text-lg">
          A real-time coach dashboard — team messages, workouts, readiness, and meet-day weather, all flowing in live.
        </p>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="h-serif">Get started</CardTitle>
          <CardDescription>Sign in to access the team dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild variant="outline" className="flex-1"><Link href="/sign-in">Sign in</Link></Button>
          <Button asChild className="flex-1"><Link href="/sign-up">Sign up</Link></Button>
        </CardContent>
      </Card>
    </main>
  );
}
