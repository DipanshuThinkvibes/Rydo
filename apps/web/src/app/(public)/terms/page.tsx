import type { Metadata } from "next";
import { Doc, Section } from "@/components/legal";

export const metadata: Metadata = { title: "Terms of use", description: "The rules for using RYDO as a rider, a driver or a company." };

export default function Terms() {
  return (
    <Doc title="Terms of use" intro="Please read these terms before you use RYDO. By signing up you agree to them." updated="18 November 2026" draft>
      <Section title="What RYDO is">
        <p>RYDO is a platform that helps colleagues of the same company share rides. RYDO does not own vehicles, employ drivers or provide transport. Rides are arranged between colleagues.</p>
      </Section>
      <Section title="Who can use it">
        <ul>
          <li>You must sign up with a work email of a company that uses RYDO, and your company&apos;s HR must approve you.</li>
          <li>Keep your account to yourself. You are responsible for what happens under it.</li>
          <li>Give accurate information. Drivers must keep their licence, registration and insurance valid.</li>
        </ul>
      </Section>
      <Section title="Riders and drivers">
        <ul>
          <li>Drivers must hold a valid licence, drive a roadworthy, insured vehicle, and follow traffic law.</li>
          <li>Riders should be at the pickup on time and use the boarding PIN. Repeated late cancellations or no-shows lower your reliability score.</li>
          <li>Treat everyone with respect. Harassment, unsafe driving and misuse are not allowed and can lead to suspension.</li>
          <li>Location is shared only during a ride, to keep everyone safe.</li>
        </ul>
      </Section>
      <Section title="Costs">
        <p>RYDO does not take or process payments. Any cost-share figure shown is only an estimate to help colleagues agree between themselves. RYDO is free to use at this time.</p>
      </Section>
      <Section title="Safety">
        <p>RYDO is not an emergency service. In an emergency, contact local emergency services first. The SOS button alerts your company&apos;s admins, but they may not be able to respond immediately. Use the issue report to tell us about a problem after a ride.</p>
      </Section>
      <Section title="Acceptable use">
        <ul>
          <li>Do not misuse the service, try to access other people&apos;s data, or interfere with how it works.</li>
          <li>Do not use chat for anything unrelated to the ride.</li>
          <li>We or your company may suspend an account that breaks these rules.</li>
        </ul>
      </Section>
      <Section title="Availability and changes">
        <p>We work to keep RYDO available but cannot promise it will never be interrupted. We may change features, and we will update these terms when we do. Matching suggestions are recommendations, not promises about safety, arrival time or route.</p>
      </Section>
      <Section title="Responsibility">
        <p>To the extent the law allows, RYDO is not responsible for the conduct of riders and drivers, or for loss or injury during a ride. Nothing here limits rights you have by law. Your legal team should finalise this section before launch.</p>
      </Section>
    </Doc>
  );
}
