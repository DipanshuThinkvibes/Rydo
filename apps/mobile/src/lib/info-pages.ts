/**
 * The web's public text pages (apps/web/src/app/(public)), as data for the phone's Help and about screens.
 * Keep the wording in step with the web pages when either changes. **bold** marks bold text.
 */
export type InfoBlock =
  | { kind: 'section'; title: string; text?: string; list?: string[] }
  | { kind: 'steps'; title: string; steps: [string, string][] }
  | { kind: 'cards'; items: [string, string][] }
  | { kind: 'faq'; items: [string, string][] }
  | { kind: 'price'; label: string; price: string; text: string; list: string[] };

export interface InfoPage {
  title: string;
  intro: string;
  updated?: string;
  /** Legal text still to be reviewed (shows the same note as the web). */
  draft?: boolean;
  blocks: InfoBlock[];
  /** A note after the blocks. */
  footer?: string;
}

export const INFO_PAGES = {
  'how-it-works': {
    title: 'How RYDO works',
    intro: 'One account, two ways to use it. You can ride, drive, or both.',
    blocks: [
      {
        kind: 'steps',
        title: 'As a rider',
        steps: [
          ['Sign in with your work email', "Enter your email, get a 6-digit code. The first time, your company's HR approves your account."],
          ['Set your home and office', 'Pick them on the map once. Your usual week can be saved for automatic planning.'],
          ['Find a ride', 'Choose pickup, drop, date, time, seats, car or bike, car type and AC. The best match comes first, with reasons.'],
          ['Send a request', 'The driver accepts or declines. You are notified in the app and on your phone.'],
          ['Chat and travel', 'Message your driver, follow the car live, board with your PIN, and share the trip with family.'],
          ['Rate the ride', 'Rate your driver after the ride, and send feedback or report any issue.'],
        ],
      },
      {
        kind: 'steps',
        title: 'As a driver',
        steps: [
          ['Become a driver', 'Add your vehicle and upload your licence and registration. HR verifies them.'],
          ['Publish a ride', 'Set route, time, seats and repeating days. Rides are created for the next two weeks.'],
          ['Manage requests', 'Accept or decline riders, chat with them, and see everyone on your route.'],
          ['Drive', 'Start the ride, pick riders up with their PIN, and complete the trip. Your location is shared only during the ride.'],
        ],
      },
      {
        kind: 'section',
        title: 'Safety built in',
        text: "Verified drivers, a boarding PIN, live tracking, an SOS button that alerts your company's admins at once, emergency contacts, blocking, and a way to report issues. Your phone number is never shown to other people.",
      },
    ],
  },
  faq: {
    title: 'Frequently asked questions',
    intro: 'Quick answers about riding, driving and bringing RYDO to a company.',
    blocks: [
      {
        kind: 'faq',
        items: [
          ['Who can use RYDO?', "Employees of a company that uses RYDO. You sign up with your work email, and your company's HR approves your account before you can ride or drive."],
          ['Is RYDO free?', 'Yes. RYDO is free for companies and employees right now, and it does not process payments. Any cost-share figure is only an estimate for colleagues to agree between themselves.'],
          ['How do I find a ride?', 'Open Find a ride, choose your pickup and drop, the date and time window, and how many seats you need. You can also filter by car or bike, car type and AC. The best match comes first, with the reasons.'],
          ['How do I become a driver?', 'Open Drive, add your vehicle, and upload your driving licence and registration. HR checks them. After that you can publish rides with repeating days and seats.'],
          ['Is it safe?', "Everyone is approved by HR and drivers' papers are checked. You board with a PIN, can follow the trip live, share it with family, use SOS to alert your company's admins, block people, and report issues."],
          ['Who can see my phone number?', 'Nobody but you. Other riders and drivers never see your phone number or email.'],
          ['When can I chat with my driver or rider?', 'Once a seat is confirmed. The chat is private between the driver and that rider, and it closes when the ride ends.'],
          ['What if I need to cancel?', "Riders can cancel a request or booking. Cancelling inside your company's free-cancel window is fine; cancelling very late lowers your reliability score."],
          ['My company is not on RYDO. What now?', 'Use the Contact us form. The RYDO team will get in touch within 2 working days to set up your company, offices and admins.'],
          ['I forgot my password.', 'Use "Forgot password?" on the sign-in screen, or sign in with a 6-digit email code instead.'],
        ],
      },
    ],
  },
  'for-companies': {
    title: 'RYDO for companies',
    intro: 'Give employees a safe, simple way to share the commute, with the controls your HR and operations teams need.',
    blocks: [
      {
        kind: 'cards',
        items: [
          ['Your company, walled off', 'Each company has its own space. Employees and admins only ever see their own people, rides and data.'],
          ['HR stays in control', "HR approves every employee, verifies drivers' documents, and can suspend accounts at any time."],
          ['Oversight for operations', 'A live map of rides, an SOS alert board, reports with CSV export, CO₂ saved, and a full activity log.'],
          ['Listen to your people', 'Collect feedback, run surveys, track reported issues from open to resolved, and see trends over time.'],
          ['Talk to everyone', 'Send announcements to the whole company, or just riders or drivers, in the app, on phones and by email.'],
          ['Your rules', 'Set the free-cancel window, pickup distance, request timeouts, offices and teams. Switch features on or off per company.'],
        ],
      },
      {
        kind: 'section',
        title: 'Getting started',
        text: 'The RYDO team creates your company, your first admin and your offices. Your admin signs in, adds teams, and employees join with their work email.',
      },
    ],
  },
  pricing: {
    title: 'Pricing',
    intro: 'Simple for now: RYDO costs nothing.',
    blocks: [
      {
        kind: 'price',
        label: 'Right now',
        price: 'Free',
        text: 'RYDO is free for companies and employees during this period. There are no plans to choose, no payments to make and no in-app payments between riders and drivers.',
        list: ['Unlimited rides and bookings', 'Live trips, SOS, chat and ratings', 'Admin dashboard, reports and surveys', 'Support from the RYDO team'],
      },
    ],
    footer: 'Fuel cost-sharing is shown only as an estimate to help riders and drivers agree between themselves. If paid plans are introduced later, companies will be told well in advance.',
  },
  about: {
    title: 'About RYDO',
    intro: 'We help colleagues share the ride to work: fewer cars, shorter commutes, and a team that gets there together.',
    blocks: [
      {
        kind: 'section',
        title: 'Why RYDO',
        text: "Most office commutes carry one person in a car built for four. Carpooling fixes that, but people hesitate to ride with strangers and companies lack a safe way to organise it. RYDO brings the two together: a carpool that only your own verified colleagues can join, run with your company's approval.",
      },
      {
        kind: 'section',
        title: 'How we build it',
        list: [
          '**Company first.** Each company has its own private space, managed by its own admins.',
          '**Safety by design.** Verified drivers, boarding PINs, live trip sharing, SOS and a clear way to report problems.',
          '**Privacy by default.** Phone numbers and emails are never shown to other riders. Location is shared only during a ride.',
          '**Simple to use.** One account on web and mobile, ride or drive, with suggestions that explain themselves.',
        ],
      },
      { kind: 'section', title: 'Who is behind it', text: 'RYDO is a product of Thinkvibes. We run the platform, set up each client company, and support them.' },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    intro: 'RYDO helps colleagues share the ride to work. This page explains what we collect, why, and who can see it.',
    updated: '18 November 2026',
    draft: true,
    blocks: [
      {
        kind: 'section',
        title: 'What we collect',
        list: [
          '**Account:** your name and work email. Optionally your phone number and gender.',
          "**Places:** your home, pickup and drop points, and your company's offices.",
          "**Live location:** only during a ride you take part in, from the driver's phone (and from you if you press SOS).",
          '**Driver details:** vehicle details, driving licence and registration papers, and their expiry dates.',
          '**Activity:** rides, requests, ratings and comments, chat messages with your driver or rider, feedback, issue reports and survey answers.',
          '**Device:** a push notification token if you use the mobile app.',
        ],
      },
      {
        kind: 'section',
        title: 'Why we use it',
        list: [
          'To match you with colleagues and run your rides.',
          'To keep rides safe: verifying drivers, boarding PINs, live tracking, SOS and issue handling.',
          'To give your company reports about commuting, such as rides, cancellations and CO₂ saved.',
          'To send you notices about your rides, by email and, if you use the app, on your phone.',
        ],
      },
      {
        kind: 'section',
        title: 'Who can see it',
        list: [
          '**Other riders and drivers** see your name, photo, rating and the details of a ride you share. **Your phone number and email are never shown to them.**',
          "**Your company's admins** (HR, operations) see your profile, rides, documents and reports for their own company only. One company can never see another's data.",
          '**Chat** is visible only to the driver and the rider in that thread. Admins cannot read it.',
          "**RYDO staff** can look at a company's admin screens read-only when that company is being supported. Each such session is logged.",
          'A **trip share link** you create shows the route, vehicle and position to anyone who has the link, until a few hours after the ride.',
        ],
      },
      { kind: 'section', title: 'Services we rely on', text: 'We use Google Maps for address search and routes, an email service for messages, and Firebase for phone notifications. They receive only what they need to do that job.' },
      {
        kind: 'section',
        title: 'How long we keep it',
        list: [
          'Live location points are deleted after 30 days, or 90 days if an SOS was raised on that ride.',
          'Chat stays readable to its two people after a ride but cannot be added to.',
          'The activity log of admin actions is kept so that actions can be investigated.',
          'Account data is kept while you are part of your company on RYDO. Ask us or your company admin to remove it when you leave.',
        ],
      },
      { kind: 'section', title: 'Cookies', text: 'We use only the cookies needed to keep you signed in and protect your session. We do not use advertising cookies.' },
      { kind: 'section', title: 'Security', text: 'Data is sent over HTTPS, passwords are stored hashed, every request is checked against your company and your role, and sign-in attempts are rate-limited.' },
      { kind: 'section', title: 'Your choices', text: 'You can edit your profile, remove your photo, block people, and delete emergency contacts at any time. To see, correct or delete your data, contact your company admin or us.' },
    ],
  },
  terms: {
    title: 'Terms of use',
    intro: 'Please read these terms before you use RYDO. By signing up you agree to them.',
    updated: '18 November 2026',
    draft: true,
    blocks: [
      { kind: 'section', title: 'What RYDO is', text: 'RYDO is a platform that helps colleagues of the same company share rides. RYDO does not own vehicles, employ drivers or provide transport. Rides are arranged between colleagues.' },
      {
        kind: 'section',
        title: 'Who can use it',
        list: [
          "You must sign up with a work email of a company that uses RYDO, and your company's HR must approve you.",
          'Keep your account to yourself. You are responsible for what happens under it.',
          'Give accurate information. Drivers must keep their licence, registration and insurance valid.',
        ],
      },
      {
        kind: 'section',
        title: 'Riders and drivers',
        list: [
          'Drivers must hold a valid licence, drive a roadworthy, insured vehicle, and follow traffic law.',
          'Riders should be at the pickup on time and use the boarding PIN. Repeated late cancellations or no-shows lower your reliability score.',
          'Treat everyone with respect. Harassment, unsafe driving and misuse are not allowed and can lead to suspension.',
          'Location is shared only during a ride, to keep everyone safe.',
        ],
      },
      { kind: 'section', title: 'Costs', text: 'RYDO does not take or process payments. Any cost-share figure shown is only an estimate to help colleagues agree between themselves. RYDO is free to use at this time.' },
      { kind: 'section', title: 'Safety', text: "RYDO is not an emergency service. In an emergency, contact local emergency services first. The SOS button alerts your company's admins, but they may not be able to respond immediately. Use the issue report to tell us about a problem after a ride." },
      {
        kind: 'section',
        title: 'Acceptable use',
        list: [
          "Do not misuse the service, try to access other people's data, or interfere with how it works.",
          'Do not use chat for anything unrelated to the ride.',
          'We or your company may suspend an account that breaks these rules.',
        ],
      },
      { kind: 'section', title: 'Availability and changes', text: 'We work to keep RYDO available but cannot promise it will never be interrupted. We may change features, and we will update these terms when we do. Matching suggestions are recommendations, not promises about safety, arrival time or route.' },
      { kind: 'section', title: 'Responsibility', text: 'To the extent the law allows, RYDO is not responsible for the conduct of riders and drivers, or for loss or injury during a ride. Nothing here limits rights you have by law. Your legal team should finalise this section before launch.' },
    ],
  },
} satisfies Record<string, InfoPage>;

export type InfoSlug = keyof typeof INFO_PAGES;
export const INFO_ORDER: { slug: InfoSlug; sub: string }[] = [
  { slug: 'how-it-works', sub: 'Riding and driving, step by step' },
  { slug: 'faq', sub: 'Quick answers' },
  { slug: 'for-companies', sub: 'What HR and operations get' },
  { slug: 'pricing', sub: 'Free right now' },
  { slug: 'about', sub: 'Why we built RYDO' },
  { slug: 'privacy', sub: 'What we collect and who sees it' },
  { slug: 'terms', sub: 'The rules for using RYDO' },
];
