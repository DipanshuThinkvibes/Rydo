import type { Metadata } from "next";
import { Doc } from "@/components/legal";

export const metadata: Metadata = { title: "FAQ", description: "Answers to common questions about riding, driving and bringing RYDO to a company." };

const faqs: [string, string][] = [
  ["Who can use RYDO?", "Employees of a company that uses RYDO. You sign up with your work email, and your company's HR approves your account before you can ride or drive."],
  ["Is RYDO free?", "Yes. RYDO is free for companies and employees right now, and it does not process payments. Any cost-share figure is only an estimate for colleagues to agree between themselves."],
  ["How do I find a ride?", "Open Find a ride, choose your pickup and drop, the date and time window, and how many seats you need. You can also filter by car or bike, car type and AC. The best match comes first, with the reasons."],
  ["How do I become a driver?", "Open Drive, add your vehicle, and upload your driving licence and registration. HR checks them. After that you can publish rides with repeating days and seats."],
  ["Is it safe?", "Everyone is approved by HR and drivers' papers are checked. You board with a PIN, can follow the trip live, share it with family, use SOS to alert your company's admins, block people, and report issues."],
  ["Who can see my phone number?", "Nobody but you. Other riders and drivers never see your phone number or email."],
  ["When can I chat with my driver or rider?", "Once a seat is confirmed. The chat is private between the driver and that rider, and it closes when the ride ends."],
  ["What if I need to cancel?", "Riders can cancel a request or booking. Cancelling inside your company's free-cancel window is fine; cancelling very late lowers your reliability score."],
  ["My company is not on RYDO. What now?", "Use the Contact us form. The RYDO team will get in touch within 2 working days to set up your company, offices and admins."],
  ["I forgot my password.", "Use \"Forgot password\" on the log-in page, or sign in with a 6-digit email code instead."],
];

export default function Faq() {
  return (
    <Doc title="Frequently asked questions" intro="Quick answers about riding, driving and bringing RYDO to a company.">
      <div className="flex flex-col gap-3">
        {faqs.map(([q, a]) => (
          <details key={q} className="group rounded-2xl border border-line bg-white p-5 open:shadow-soft">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-extrabold [&::-webkit-details-marker]:hidden">
              {q}
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted">{a}</p>
          </details>
        ))}
      </div>
    </Doc>
  );
}
