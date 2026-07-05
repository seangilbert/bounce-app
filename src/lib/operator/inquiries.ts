export type InquiryStatus = "needs_review" | "escalated" | "auto";

export interface InquiryListItem {
  id: string;
  name: string;
  initials: string;
  time: string;
  status: InquiryStatus;
  preview: string;
  customerType: string;
  location: string;
}

export interface AiDraft {
  match: { name: string; availabilityLabel: string; price: string; unit: string };
  message: string;
  replyDraft: string;
}

export interface InquiryDetail {
  whyBanner?: string;
  /** The customer's inbound message. */
  message: { text: string; meta: string };
  /** Present when the assistant escalated and drafted a reply for review. */
  aiDraft?: AiDraft;
  /** Present for already auto-handled inquiries. */
  handledNote?: string;
}

export const inquiryFilters = { all: 6, needsYou: 1, auto: 5 };

export const inquiries: InquiryListItem[] = [
  {
    id: "jenna",
    name: "Jenna Marsh",
    initials: "JM",
    time: "6:52 AM",
    status: "needs_review",
    preview: "“Is the princess bounce house available for Sat the 12th, backyard in Plymouth, ~20 kids?”",
    customerType: "New customer",
    location: "Plymouth, MA",
  },
  {
    id: "dana",
    name: "Dana Cole",
    initials: "DC",
    time: "Yesterday",
    status: "escalated",
    preview: "“We need 3 bounce houses plus tents and generators for a school fair on Sept 6.”",
    customerType: "Returning customer",
    location: "Duxbury, MA",
  },
  {
    id: "tom",
    name: "Tom Reyes",
    initials: "TR",
    time: "6:40 AM",
    status: "auto",
    preview: "Quoted $200/day · confirmed Jul 19 · booking link sent.",
    customerType: "New customer",
    location: "Plymouth, MA",
  },
  {
    id: "priya",
    name: "Priya Shah",
    initials: "PS",
    time: "6:12 AM",
    status: "auto",
    preview: "Yes — $25 delivery to Kingston · Rainbow 13×13 quoted $175.",
    customerType: "New customer",
    location: "Kingston, MA",
  },
  {
    id: "luis",
    name: "Luis Gomez",
    initials: "LG",
    time: "Yest.",
    status: "auto",
    preview: "Justice League quoted $200/day for Aug 2 · link sent.",
    customerType: "Returning customer",
    location: "Plymouth, MA",
  },
];

/** Rich detail keyed by inquiry id. Only escalated/needs-review get an AI draft. */
export const inquiryDetails: Record<string, InquiryDetail> = {
  jenna: {
    whyBanner:
      "The princess castle isn't in your inventory, so I didn't auto-send. I've drafted a reply using your closest match — review it below.",
    message: {
      text: "Hi! Is the princess bounce house available for Sat the 12th? Backyard in Plymouth, about 20 kids. 🎉",
      meta: "6:51 AM · via your website",
    },
    aiDraft: {
      match: {
        name: "Rainbow 15×15 Bounce Castle",
        availabilityLabel: "Sat, Jul 12",
        price: "$190",
        unit: "/ day",
      },
      message:
        "Hi Jenna! We don't carry a princess castle, but our Rainbow 15×15 Bounce Castle is a big hit with the kids — and it's free Sat the 12th. It's $190 for the day, delivered to Plymouth. Want me to hold it for you?",
      replyDraft:
        "Hi Jenna! We don't carry a princess castle, but our Rainbow 15×15 is a big hit and it's free Sat the 12th — $190 delivered. Want me to hold it?",
    },
  },
  dana: {
    whyBanner:
      "A large multi-item order (3 bounce houses + tents + generators) is above the auto-quote limit, so I flagged it for you.",
    message: {
      text: "We need 3 bounce houses plus tents and generators for a school fair on Sept 6. Can you put together a package price?",
      meta: "Yesterday · via your website",
    },
    aiDraft: {
      match: {
        name: "School fair package (custom)",
        availabilityLabel: "Sat, Sep 6",
        price: "Quote",
        unit: "needed",
      },
      message:
        "Hi Dana! A 3-unit setup with tents and generators is something we'd love to do. Let me confirm generator availability and put together a package price for Sept 6 — I'll follow up shortly.",
      replyDraft:
        "Hi Dana! We'd love to cover your school fair on Sept 6. Let me confirm generator availability and send a package price shortly.",
    },
  },
  tom: {
    message: {
      text: "Do you have anything superhero-themed for a birthday on Jul 19?",
      meta: "6:40 AM · via your website",
    },
    handledNote: "Quoted $200/day · confirmed Jul 19 · booking link sent.",
  },
  priya: {
    message: {
      text: "Can you deliver to Kingston? Looking at the Rainbow 13×13.",
      meta: "6:12 AM · via your website",
    },
    handledNote: "Yes — $25 delivery to Kingston · Rainbow 13×13 quoted $175.",
  },
  luis: {
    message: {
      text: "Justice League bounce house for Aug 2?",
      meta: "Yesterday · via your website",
    },
    handledNote: "Justice League quoted $200/day for Aug 2 · booking link sent.",
  },
};
