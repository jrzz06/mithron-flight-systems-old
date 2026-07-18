import { HomePageContent } from "@/sections/home/home-page-content";

export const revalidate = 60;

export default function HomePage() {
  return <HomePageContent cmsDraftPreview={false} />;
}
