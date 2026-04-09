export interface ClubRole {
  role_id: string;
  club_id: string;
  role_name: string;
  role_description: string;
  permission_set: string[];
}

export interface Chapter {
  chapter_id: string;
  club_id: string;
  chapter_name: string;
  city: string;
  country: string;
  description: string;
  creation_date: string;
  logo_url?: string;
}

export interface ChapterMember {
  chapter_membership_id: string;
  chapter_id: string;
  user_id: string;
  role_id: string;
  secondary_role_id?: string;
  join_date: string;
}

export interface Club {
  club_id: string;
  name: string;
  description: string;
  logo_url: string;
  founded_date: string;
}

export interface User {
  user_id: string;
  name: string;
  username: string;
  avatar_url: string;
}

// Mock Data
export const mockClubs: Club[] = [
  {
    club_id: 'club_1',
    name: 'Iron Riders MC',
    description: 'A global brotherhood of riders dedicated to the open road.',
    logo_url: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&q=80&w=200&h=200',
    founded_date: '2010-05-15',
  }
];

export const mockClubRoles: ClubRole[] = [
  { role_id: 'role_pres', club_id: 'club_1', role_name: 'President', role_description: 'Overall leader of the club', permission_set: ['manage_settings', 'assign_roles', 'manage_chapters', 'approve_members'] },
  { role_id: 'role_vp', club_id: 'club_1', role_name: 'Vice President', role_description: 'Second in command', permission_set: ['manage_chapters', 'approve_members'] },
  { role_id: 'role_rc', club_id: 'club_1', role_name: 'Road Captain', role_description: 'Organizes rides and routes', permission_set: ['create_rides', 'manage_events', 'post_routes'] },
  { role_id: 'role_saa', club_id: 'club_1', role_name: 'Sergeant-at-Arms', role_description: 'Maintains order and security', permission_set: ['moderate_posts', 'manage_behavior', 'remove_members'] },
  { role_id: 'role_treasurer', club_id: 'club_1', role_name: 'Treasurer', role_description: 'Manages finances', permission_set: ['manage_dues', 'manage_finances'] },
  { role_id: 'role_sec', club_id: 'club_1', role_name: 'Secretary', role_description: 'Handles administration', permission_set: ['manage_records'] },
  { role_id: 'role_member', club_id: 'club_1', role_name: 'Member', role_description: 'Standard club member', permission_set: ['view_content', 'join_rides'] },
];

export const mockChapters: Chapter[] = [
  { chapter_id: 'chap_sp', club_id: 'club_1', chapter_name: 'São Paulo Chapter', city: 'São Paulo', country: 'Brazil', description: 'The heart of Iron Riders in Brazil.', creation_date: '2012-08-20' },
  { chapter_id: 'chap_rio', club_id: 'club_1', chapter_name: 'Rio Chapter', city: 'Rio de Janeiro', country: 'Brazil', description: 'Cruising the coast.', creation_date: '2015-11-10' },
  { chapter_id: 'chap_lisbon', club_id: 'club_1', chapter_name: 'Lisbon Chapter', city: 'Lisbon', country: 'Portugal', description: 'European headquarters.', creation_date: '2018-03-05' },
];

export const mockUsers: User[] = [
  { user_id: 'user_1', name: 'Carlos Silva', username: 'carlos_rider', avatar_url: 'https://i.pravatar.cc/150?u=user_1' },
  { user_id: 'user_2', name: 'Ana Costa', username: 'ana_moto', avatar_url: 'https://i.pravatar.cc/150?u=user_2' },
  { user_id: 'user_3', name: 'João Santos', username: 'joao_s', avatar_url: 'https://i.pravatar.cc/150?u=user_3' },
  { user_id: 'user_4', name: 'Maria Oliveira', username: 'maria_o', avatar_url: 'https://i.pravatar.cc/150?u=user_4' },
];

export const mockChapterMembers: ChapterMember[] = [
  { chapter_membership_id: 'mem_1', chapter_id: 'chap_sp', user_id: 'user_1', role_id: 'role_pres', join_date: '2012-08-20' },
  { chapter_membership_id: 'mem_2', chapter_id: 'chap_sp', user_id: 'user_2', role_id: 'role_rc', secondary_role_id: 'role_member', join_date: '2013-01-15' },
  { chapter_membership_id: 'mem_3', chapter_id: 'chap_rio', user_id: 'user_3', role_id: 'role_vp', join_date: '2015-11-10' },
  { chapter_membership_id: 'mem_4', chapter_id: 'chap_lisbon', user_id: 'user_4', role_id: 'role_member', join_date: '2018-03-05' },
];
