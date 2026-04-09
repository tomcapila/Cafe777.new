import React, { createContext, useContext, useState, useEffect } from 'react';

interface FeatureFlags {
  scanner: boolean;
  achievements: boolean;
  feed: boolean;
  map: boolean;
  passport: boolean;
  clubs: boolean;
  profile: boolean;
  events: boolean;
}

const defaultFlags: FeatureFlags = {
  scanner: true,
  achievements: true,
  feed: true,
  map: true,
  passport: true,
  clubs: true,
  profile: true,
  events: true,
};

const FeatureFlagContext = createContext({
  flags: defaultFlags,
  toggleFlag: (flag: keyof FeatureFlags) => {},
});

export const FeatureFlagProvider = ({ children }: { children: React.ReactNode }) => {
  const [flags, setFlags] = useState<FeatureFlags>(() => {
    const saved = localStorage.getItem('featureFlags');
    if (!saved) return defaultFlags;
    try {
      const parsed = JSON.parse(saved);
      return { ...defaultFlags, ...parsed };
    } catch (e) {
      return defaultFlags;
    }
  });

  useEffect(() => {
    localStorage.setItem('featureFlags', JSON.stringify(flags));
  }, [flags]);

  const toggleFlag = (flag: keyof FeatureFlags) => {
    setFlags((prev) => ({ ...prev, [flag]: !prev[flag] }));
  };

  return (
    <FeatureFlagContext.Provider value={{ flags, toggleFlag }}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const useFeatureFlags = () => useContext(FeatureFlagContext);
