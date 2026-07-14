import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Upload,
  BookOpen,
  GraduationCap,
  ClipboardList,
  Target,
  RotateCcw,
  StickyNote,
  Settings,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload material", icon: Upload },
  { href: "/courses", label: "My courses", icon: BookOpen },
  { href: "/learn", label: "Learn", icon: GraduationCap },
  { href: "/mock", label: "Mock exam", icon: ClipboardList },
  { href: "/progress", label: "Progress", icon: Target },
  { href: "/revision", label: "Revision", icon: RotateCcw },
  { href: "/notes", label: "Notes & bookmarks", icon: StickyNote },
  { href: "/settings", label: "AI settings", icon: Settings },
];
