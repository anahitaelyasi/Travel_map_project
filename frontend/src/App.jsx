import React, { useEffect } from 'react';
import { initializeLegacyApp } from './legacy/controller.js';
import { ToastContainer, MapCanvas, SideNavigation, MapMenuPanel, SearchPanel, ProfilePanel, EditProfilePanel, DirectionsPanel, HamsafarPanel, PermanentGroupsPanel, MapTools, IncomingRequestModal, ConfirmationModal, AuthModal } from './components/OriginalLayout.jsx';

/** Original layout is unchanged. Behavior is incrementally migrated via the controller. */
export default function App() {
  useEffect(() => {
    const teardown = initializeLegacyApp();
    return () => teardown?.();
  }, []);
  return <>
      <ToastContainer />
      <MapCanvas />
      <SideNavigation />
      <MapMenuPanel />
      <SearchPanel />
      <ProfilePanel />
      <EditProfilePanel />
      <DirectionsPanel />
      <HamsafarPanel />
      <PermanentGroupsPanel />
      <MapTools />
      <IncomingRequestModal />
      <ConfirmationModal />
      <AuthModal />
  </>;
}
