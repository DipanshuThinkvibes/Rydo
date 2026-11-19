import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "How it works" };

const rider = [
  ["Sign in with your work email", "Enter your email, get a 6-digit code. The first time, your company's HR approves your account."],
  ["Set your home and office", "Pick them on the map once. Your usual week can be saved for automatic planning."],
  ["Find a ride", "Choose pickup, drop, date, time, seats, car or bike, car type and AC. The best match comes first, with reasons."],
  ["Send a request", "The driver accepts or declines. You are notified in the app and on your phone."],
  ["Chat and travel", "Message your driver, follow the car live, board with your PIN, and share the trip with family."],
  ["Rate the ride", "Rate your driver after the ride, and send feedback or report any issue."],
];
const driver = [
  ["Become a driver", "Add your vehicle and upload your licence and registration. HR verifies them."],
  ["Publish a ride", "Set route, time, seats and repeating days. Rides are created for the next two weeks."],
  ["Manage requests", "Accept or decline riders, chat with them, and see everyone on your route."],
  ["Drive", "Start the ride, pick riders up with their PIN, and complete the trip. Your location is shared only during the ride."],
];

function Steps({ title, steps }: { title: string; steps: string[][] }) {
  return (
    <div>
      <h2 className="text-2xl font-extrabold">{title}</h2>
      <ol className="mt-5 flex flex-col gap-3">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-4 rounded-[22px] border border-line/70 bg-white p-5 shadow-soft">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime font-extrabold">{i + 1}</span>
            <span><span className="block font-extrabold">{t}</span><span className="text-sm text-muted">{d}</span></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-8">
      <h1 className="text-4xl font-extrabold">How RYDO works</h1>
      <p className="mt-3 max-w-2xl text-muted">One account, two ways to use it. You can ride, drive, or both.</p>
      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <Steps title="As a rider" steps={rider} />
        <Steps title="As a driver" steps={driver} />
      </div>
      <div className="mt-12 rounded-[22px] bg-ink p-8 text-white">
        <h2 className="text-xl font-extrabold">Safety built in</h2>
        <p className="mt-2 max-w-2xl text-[#B8C2D6]">Verified drivers, a boarding PIN, live tracking, an SOS button that alerts your company&apos;s admins at once, emergency contacts, blocking, and a way to report issues. Your phone number is never shown to other people.</p>
        <Link href="/sign-up" className="mt-5 inline-flex h-11 items-center rounded-2xl bg-lime px-5 font-extrabold text-ink">Get started</Link>
      </div>
    </div>
  );
}
