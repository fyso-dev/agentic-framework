// Curated common work apps, not a usage ranking. Native catalog metadata supplies names/logos.
export const recommendedApps=['gmail','github','slack','googlecalendar','googledrive','googlesheets','notion','jira','outlook','microsoft_teams'] as const;
export function isRecommendedApp(slug:string) {return (recommendedApps as readonly string[]).includes(slug);}
