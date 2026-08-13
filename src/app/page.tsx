import { applicationStatus } from "@/lib/application-status";

export default function HomePage() {
  return (
    <main>
      <h1>{applicationStatus.title}</h1>
      <p>{applicationStatus.message}</p>
    </main>
  );
}
