import type { Metadata } from "next";
import { Doc, Section } from "@/components/legal";

export const metadata: Metadata = { title: "Privacy policy", description: "What RYDO collects, why, who can see it and how long it is kept." };

export default function Privacy() {
  return (
    <Doc title="Privacy policy" intro="RYDO helps colleagues share the ride to work. This page explains what we collect, why, and who can see it." updated="18 November 2026" draft>
      <Section title="What we collect">
        <ul>
          <li><b>Account:</b> your name and work email. Optionally your phone number and gender.</li>
          <li><b>Places:</b> your home, pickup and drop points, and your company&apos;s offices.</li>
          <li><b>Live location:</b> only during a ride you take part in, from the driver&apos;s phone (and from you if you press SOS).</li>
          <li><b>Driver details:</b> vehicle details, driving licence and registration papers, and their expiry dates.</li>
          <li><b>Activity:</b> rides, requests, ratings and comments, chat messages with your driver or rider, feedback, issue reports and survey answers.</li>
          <li><b>Device:</b> a push notification token if you use the mobile app.</li>
        </ul>
      </Section>
      <Section title="Why we use it">
        <ul>
          <li>To match you with colleagues and run your rides.</li>
          <li>To keep rides safe: verifying drivers, boarding PINs, live tracking, SOS and issue handling.</li>
          <li>To give your company reports about commuting, such as rides, cancellations and CO₂ saved.</li>
          <li>To send you notices about your rides, by email and, if you use the app, on your phone.</li>
        </ul>
      </Section>
      <Section title="Who can see it">
        <ul>
          <li><b>Other riders and drivers</b> see your name, photo, rating and the details of a ride you share. <b>Your phone number and email are never shown to them.</b></li>
          <li><b>Your company&apos;s admins</b> (HR, operations) see your profile, rides, documents and reports for their own company only. One company can never see another&apos;s data.</li>
          <li><b>Chat</b> is visible only to the driver and the rider in that thread. Admins cannot read it.</li>
          <li><b>RYDO staff</b> can look at a company&apos;s admin screens read-only when that company is being supported. Each such session is logged.</li>
          <li>A <b>trip share link</b> you create shows the route, vehicle and position to anyone who has the link, until a few hours after the ride.</li>
        </ul>
      </Section>
      <Section title="Services we rely on">
        <p>We use Google Maps for address search and routes, an email service for messages, and Firebase for phone notifications. They receive only what they need to do that job.</p>
      </Section>
      <Section title="How long we keep it">
        <ul>
          <li>Live location points are deleted after 30 days, or 90 days if an SOS was raised on that ride.</li>
          <li>Chat stays readable to its two people after a ride but cannot be added to.</li>
          <li>The activity log of admin actions is kept so that actions can be investigated.</li>
          <li>Account data is kept while you are part of your company on RYDO. Ask us or your company admin to remove it when you leave.</li>
        </ul>
      </Section>
      <Section title="Cookies">
        <p>We use only the cookies needed to keep you signed in and protect your session. We do not use advertising cookies.</p>
      </Section>
      <Section title="Security">
        <p>Data is sent over HTTPS, passwords are stored hashed, every request is checked against your company and your role, and sign-in attempts are rate-limited.</p>
      </Section>
      <Section title="Your choices">
        <p>You can edit your profile, remove your photo, block people, and delete emergency contacts at any time. To see, correct or delete your data, contact your company admin or us.</p>
      </Section>
    </Doc>
  );
}
