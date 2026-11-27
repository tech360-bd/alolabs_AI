/** Public data shared by the studio menu and the original chrome imports. */
export interface NavItem { href: string; label: string; hint?: string }
const overview = { href: '/', label: 'Overview' };
const solutions = { href: '/site/solutions', label: 'Solutions', hint: 'What we solve' };
const services = { href: '/site/services', label: 'Services', hint: 'How we deliver' };
const process = { href: '/site/how-we-work', label: 'How we work', hint: 'Our process' };
const about = { href: '/site/about', label: 'About', hint: 'The company' };
const careers = { href: '/site/careers', label: 'Careers', hint: 'Join the team' };
const contact = { href: '/site/contact', label: 'Contact', hint: 'Talk to us' };
const projects = { href: '/site/projects', label: 'Projects', hint: 'What we are building' };

export const SITE_NAV: NavItem[] = [solutions, services, process, about, careers, contact];
const stack = { href: '/site/stack', label: 'Stack register', hint: 'What we build, mirror and owe' };

export const SITE_RESOURCE_NAV: NavItem[] = [projects, stack,
  { href: '/portal', label: 'Client portal', hint: 'Projects, deliverables, billing' },
  { href: '/site/privacy', label: 'Privacy Policy', hint: 'How we handle data' },
  { href: '/site/terms', label: 'Terms of Service', hint: 'Working with us' },
];
export const primary: NavItem[] = [overview, solutions, services, process];
export const company: NavItem[] = [about, projects, careers, contact];
