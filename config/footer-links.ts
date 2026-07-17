import type { FooterColumn } from "@/config/storefront-content";

export const footerOfficialLinks = {
  mithronSmart: "https://www.mithronsmart.com",
  mithronStore: "/",
  agrone: "https://www.mithronsmart.com/agri-drone-business",
  zroneo: "https://play.google.com/store/apps/details?id=com.mithronfarmer",
  droningPlatform: "https://drone.mithronsmart.com",
  droningLogin: "https://drone.mithronsmart.com/selectlogin",
  droneEmi: "https://drone.mithronsmart.com/drone-emi",
  supplierPortal: "https://www.mithronsmart.com/supplier",
  linkedIn: "https://www.linkedin.com/company/mithron-india-smart-services-pvt-ltd/",
  instagram: "https://www.instagram.com/mithronsmart/",
  facebook: "https://www.facebook.com/p/Mithron-India-Agtech-100088815738230/",
  youtube: "https://www.youtube.com/channel/UCzeHU4vY6q1y1xrGkXsv5ow",
  contactEmail: "rk@mithronsmart.com",
  contactPhones: ["+918861304108", "+919591481517", "+918939123421"],
  smartWebsite: "https://www.mithronsmart.com"
} as const;

export const footerColumns: FooterColumn[] = [
  {
    title: "Official sites",
    links: [
      ["Mithron Smart", footerOfficialLinks.mithronSmart],
      ["Mithron Store", footerOfficialLinks.mithronStore],
      ["AGRONE (Agri drones)", footerOfficialLinks.agrone],
      ["ZRONEO (City Drone App)", footerOfficialLinks.zroneo],
      ["Droning", footerOfficialLinks.droningPlatform],
      ["Droning sign-in", footerOfficialLinks.droningLogin],
      ["Drone EMI", footerOfficialLinks.droneEmi]
    ]
  },
  {
    title: "Legal",
    links: [
      ["Home", "/"],
      ["About Us", "/about"],
      ["Contact Us", "/contact"],
      ["Privacy Policy", "/privacy-policy"],
      ["Terms & Conditions", "/terms-and-conditions"],
      ["Refund Policy", "/refund-policy"],
      ["Shipping Policy", "/shipping-policy"],
      ["Cancellation Policy", "/cancellation-policy"]
    ]
  },
  {
    title: "Social media",
    links: [
      ["Mithron LinkedIn", footerOfficialLinks.linkedIn],
      ["Mithron Instagram", footerOfficialLinks.instagram],
      ["Mithron Facebook", footerOfficialLinks.facebook],
      ["Mithron YouTube", footerOfficialLinks.youtube]
    ]
  }
];
