/**
 * Compétences tab — dedicated bottom-bar page holding the blacksmith's
 * skills (Compétences) and the talent trees (Talents).
 *
 * Reuses ProfileScreen with a restricted tab set so all logic
 * (talent tree, unlock flow, skill detail modal) stays in one place.
 */

import React from 'react';
import ProfileScreen from './profile';

export default function SkillsScreen() {
  return <ProfileScreen tabs={['skills', 'talents', 'upgrades']} title="COMPÉTENCES" />;
}
