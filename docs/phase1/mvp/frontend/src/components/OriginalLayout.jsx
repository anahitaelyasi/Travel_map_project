/* Migrated directly from the original HTML. Retain the DOM hierarchy and Tailwind classes for pixel-level consistency. */
import React from "react";

export function ToastContainer() {
  return (
    <div id="toast-container" className="fixed top-16 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 pointer-events-none"></div>
  );
}

export function MapCanvas() {
  return (
    <div id="map"></div>
  );
}

export function SideNavigation() {
  return (
    <nav className="fixed top-0 right-0 bottom-0 w-16 bg-white z-40 border-l border-gray-200 shadow flex flex-col items-center py-4 gap-5">
<button id="nav-btn-map" onClick={(event) => { window.toggleMainMenu() }} className="flex flex-col items-center gap-1 text-gray-600 hover:text-blue-600 transition" title="نقشه‌من">
<i className="fa-solid fa-map-location-dot text-xl"></i><span className="text-[10px]">نقشه</span>
</button>
<div id="header-auth-section"></div>
<button id="nav-btn-hamsafar" onClick={(event) => { window.openHamsafarPanel() }} className="flex flex-col items-center gap-1 text-gray-600 hover:text-blue-600 transition" title="همسفر">
<i className="fa-solid fa-user-group text-xl"></i><span className="text-[10px]">همسفر</span>
</button>
<button id="nav-btn-groups" onClick={(event) => { window.openPermGroupsPanel() }} className="flex flex-col items-center gap-1 text-gray-600 hover:text-purple-600" title="گروه‌ها">
<i className="fa-solid fa-comments text-xl"></i><span className="text-[10px]">گروه‌ها</span>
</button>
</nav>
  );
}

export function MapMenuPanel() {
  return (
    <aside id="main-menu-panel" className="hidden fixed top-0 bottom-0 right-16 w-[320px] max-w-[calc(100vw-4rem)] bg-white z-40 shadow-2xl overflow-y-auto slim-scroll border-l border-gray-200 flex-col">

<div className="flex items-center justify-between p-4 border-b border-gray-100 shadow-sm shrink-0 bg-white">
<div className="flex items-center gap-2 text-blue-600 font-bold">
<i className="fa-solid fa-map-location-dot text-xl"></i>
<span>نقشه من</span>
</div>
<button onClick={(event) => { window.closeMainMenu() }} className="text-gray-500 hover:text-gray-900 p-1 transition"><i className="fa-solid fa-xmark text-lg"></i></button>
</div>
<div className="flex-1 py-2">
<button onClick={(event) => { window.enableAddStationMode(); window.closeMainMenu(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition text-right font-medium">
<i className="fa-solid fa-location-crosshairs text-gray-400 w-5 text-center text-lg"></i>
                افزودن مکانی که در نقشه نیست
            </button>
<button onClick={(event) => { window.showSavedPlacesView(); window.closeMainMenu(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition text-right">
<i className="fa-regular fa-star text-gray-400 w-5 text-center text-lg"></i>
                مکان‌های شخصی
            </button>
<div className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition text-right cursor-pointer">
<div className="flex items-center gap-3">
<i className="fa-solid fa-traffic-light text-gray-400 w-5 text-center text-lg"></i>
                    ترافیک معابر
                </div>
<label className="relative inline-flex items-center cursor-pointer">
<input type="checkbox" className="sr-only peer" defaultChecked={true} />
<div className="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
</label>
</div>
<div className="border-t border-gray-100 my-2"></div>
<button className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition text-right">فاصله‌شهرها</button>
<button className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition text-right">قابلیت‌ها</button>
<button className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition text-right">شرایط استفاده</button>
</div>
</aside>
  );
}

export function SearchPanel() {
  return (
    <div id="search-wrap" className="fixed top-4 right-[5rem] z-30">
<div className="relative w-[460px] max-w-[calc(100vw-6rem)]">
<div className="bg-white rounded-full shadow-lg flex items-center px-2 h-12 gap-1">
<input id="search-input" type="text" autoComplete="off" placeholder="جستجو" className="flex-1 bg-transparent outline-none text-sm px-3 min-w-0" />
<button id="search-clear" onClick={(event) => { window.clearSearch() }} className="hidden text-gray-400 hover:text-gray-700 px-1" title="پاک کردن"><i className="fa-solid fa-xmark"></i></button>
<i className="fa-solid fa-magnifying-glass text-gray-700 mx-1"></i>
<button onClick={(event) => { window.openDirections() }} className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shrink-0" title="مسیریابی">
<i className="fa-solid fa-diamond-turn-right"></i>
</button>
</div>
<div id="suggest-search" className="suggest-box"></div>
</div>
</div>
  );
}

export function ProfilePanel() {
  return (
    <aside id="profile-panel" className="hidden fixed top-0 bottom-0 right-16 w-[400px] max-w-[calc(100vw-4rem)] bg-white z-40 shadow-2xl overflow-y-auto slim-scroll border-l border-gray-200">
<div className="bg-gradient-to-bl from-cyan-50 via-blue-50 to-white p-4 pb-6 rounded-bl-[3rem]">
<div className="flex items-center justify-between mb-6 w-full">
<button onClick={(event) => { window.closeProfilePanel() }} className="text-gray-700 hover:text-gray-900 transition p-1.5 rounded-full hover:bg-black/5" title="بازگشت">
<i className="fa-solid fa-arrow-right text-lg"></i>
</button>
<div className="flex items-center gap-1">
<button onClick={(event) => { window.showToast('لینک پروفایل کپی شد!', 'success') }} className="text-gray-700 hover:text-gray-900 transition p-1.5 rounded-full hover:bg-black/5" title="کپی لینک پروفایل">
<i className="fa-solid fa-share-nodes text-lg"></i>
</button>
<button onClick={(event) => { window.toggleProfileMenu(event) }} className="text-gray-700 hover:text-gray-900 transition p-1.5 rounded-full hover:bg-black/5" title="گزینه‌ها">
<i className="fa-solid fa-ellipsis-vertical text-lg"></i>
</button>
</div>
</div>
<div className="flex flex-col items-center">
<div className="w-24 h-24 rounded-full bg-gray-200 border-4 border-white shadow-md overflow-hidden mb-3">
<img id="profile-panel-avatar" src="" className="w-full h-full object-cover" />
</div>
<h2 className="text-base font-bold text-gray-800" id="profile-panel-name">کاربر نشان</h2>
</div>
<div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex justify-center py-3 mt-5 mx-4">
<div className="text-center border-l border-gray-100 px-10">
<div className="text-[11px] text-gray-500 mb-1">مشارکت</div>
<div className="font-bold text-gray-800 text-sm">۰ <span className="text-[10px] font-normal text-gray-400">امتیاز</span></div>
</div>
<div className="text-center px-10">
<div className="text-[11px] text-gray-500 mb-1">رتبه</div>
<div className="font-bold text-gray-800 text-sm">+۱۰۰,۰۰۰</div>
</div>
</div>
</div>
<div className="flex justify-around border-b border-gray-200 px-4 mt-2">
<button className="profile-tab-btn pb-2.5 text-sm font-bold text-blue-600 border-b-2 border-blue-600" data-tab="photos" onClick={(event) => { window.switchProfileTab('photos', this) }}>عکس‌ها</button>
<button className="profile-tab-btn pb-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition" data-tab="comments" onClick={(event) => { window.switchProfileTab('comments', this) }}>نظرات</button>
<button className="profile-tab-btn pb-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition" data-tab="contributions" onClick={(event) => { window.switchProfileTab('contributions', this) }}>مشارکت</button>
<button className="profile-tab-btn pb-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition" data-tab="medals" onClick={(event) => { window.switchProfileTab('medals', this) }}>مدال‌ها</button>
</div>
<div className="p-6">
<div id="tab-content-photos" className="profile-tab-content flex flex-col items-center justify-center py-8 text-center">
<div className="w-24 h-24 mx-auto mb-4 border-2 border-dashed border-blue-200 rounded-[1.5rem] flex items-center justify-center text-blue-300 bg-blue-50/50">
<i className="fa-regular fa-image text-4xl"></i>
</div>
<h3 className="font-bold text-gray-800 mb-1.5 text-sm">اولین عکست رو اضافه کن</h3>
<p className="text-xs text-gray-500 mb-5">این صفحه هنوز خالیه</p>
<button className="border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-full px-5 py-2 text-xs flex items-center justify-center gap-2 mx-auto transition shadow-sm font-medium">
<i className="fa-solid fa-camera"></i> افزودن عکس به مکان
                </button>
</div>
</div>
<div id="profile-menu" className="hidden absolute top-12 left-4 bg-white rounded-xl shadow-xl border border-gray-100 w-48 z-50 py-1.5">
<button className="w-full text-right px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={(event) => { window.openEditProfilePanel() }}>
<i className="fa-solid fa-pen text-gray-400 w-4 text-xs"></i> ویرایش پروفایل
            </button>
<button className="w-full text-right px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={(event) => { window.confirmLogout() }}>
<i className="fa-solid fa-right-from-bracket text-gray-400 w-4 text-xs"></i> خروج از حساب کاربری
            </button>
</div>
</aside>
  );
}

export function EditProfilePanel() {
  return (
    <aside id="edit-profile-panel" className="hidden fixed top-0 bottom-0 right-16 w-[400px] max-w-[calc(100vw-4rem)] bg-white z-50 shadow-2xl overflow-y-auto slim-scroll border-l border-gray-200 flex flex-col">
<div className="flex items-center justify-between p-4 border-b border-gray-100">
<h2 className="font-bold text-gray-800 text-base">ویرایش پروفایل</h2>
<button onClick={(event) => { window.closeEditProfilePanel() }} className="text-gray-700 hover:text-gray-900 transition p-1.5 rounded-full hover:bg-black/5" title="بازگشت">
<i className="fa-solid fa-arrow-right text-lg"></i>
</button>
</div>
<div className="p-6 flex-1 overflow-y-auto slim-scroll space-y-6">
<div className="flex flex-col items-center justify-center">
<input type="file" id="edit-avatar-input" accept="image/*" className="hidden" />
<label htmlFor="edit-avatar-input" className="relative w-24 h-24 rounded-full bg-gray-200 border-4 border-white shadow-md overflow-hidden mb-2 group cursor-pointer block">
<img id="edit-avatar-preview" src="" className="w-full h-full object-cover" />
<div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
<i className="fa-solid fa-camera text-white text-xl"></i>
</div>
</label>
<label htmlFor="edit-avatar-input" className="text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer">تغییر عکس نمایە</label>
</div>
<div className="space-y-4">
<div>
<div className="relative"><input type="text" id="edit-name" placeholder="نام" className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm outline-none" /></div>
</div>
<div>
<div className="relative"><input type="text" id="edit-family" placeholder="نام خانوادگی" className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm outline-none" /></div>
</div>
<div>
<label className="block text-xs font-medium text-gray-700 mb-2">نقش کاربری</label>
<div className="grid grid-cols-2 gap-3">
<label className="flex items-center justify-center gap-2 p-3 border border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 transition has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50">
<input type="radio" name="user-role" defaultValue="passenger" className="text-blue-600 focus:ring-blue-500" defaultChecked={true} />
<span className="text-sm font-medium text-gray-700">مسافر</span>
</label>
<label className="flex items-center justify-center gap-2 p-3 border border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 transition has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50">
<input type="radio" name="user-role" defaultValue="driver" className="text-blue-600 focus:ring-blue-500" />
<span className="text-sm font-medium text-gray-700">راننده</span>
</label>
</div>
</div>
</div>
</div>
<div className="p-4 border-t border-gray-100 bg-white flex gap-3 mt-auto">
<button onClick={(event) => { window.saveProfileChanges() }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl shadow transition text-sm">ثبت</button>
<button onClick={(event) => { window.closeEditProfilePanel() }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 rounded-xl transition text-sm">انصراف</button>
</div>
</aside>
  );
}

export function DirectionsPanel() {
  return (
    <aside id="dir-panel" className="hidden fixed top-0 bottom-0 right-16 w-[420px] max-w-[calc(100vw-4rem)] bg-white z-40 shadow-2xl overflow-hidden border-l border-gray-200">
<div id="route-selection-view" className="h-full overflow-y-auto slim-scroll p-4 space-y-4">
<div className="flex items-center justify-between">
<h2 className="font-bold text-gray-800 text-base">مسیریابی</h2>
<button onClick={(event) => { window.closeDirections() }} className="text-gray-500 hover:text-gray-900 p-1"><i className="fa-solid fa-xmark text-lg"></i></button>
</div>
<div className="grid grid-cols-3 gap-2" id="profile-tabs">
<button data-p="car" onClick={(event) => { window.setProfile('car') }} className="profile-tab flex flex-col items-center gap-1 py-2 rounded-xl border text-xs"><i className="fa-solid fa-car text-base"></i>خودرو</button>
<button data-p="transit" onClick={(event) => { window.setProfile('transit') }} className="profile-tab flex flex-col items-center gap-1 py-2 rounded-xl border text-xs"><i className="fa-solid fa-bus text-base"></i>همگانی</button>
<button data-p="foot" onClick={(event) => { window.setProfile('foot') }} className="profile-tab flex flex-col items-center gap-1 py-2 rounded-xl border text-xs"><i className="fa-solid fa-person-walking text-base"></i>پیاده</button>
</div>
<div className="border border-gray-200 rounded-2xl p-2 flex items-center gap-2">
<div className="flex-1 min-w-0">
<div className="relative">
<span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-blue-600"><i className="fa-regular fa-circle text-xs"></i></span>
<input id="start-point" type="text" autoComplete="off" placeholder="مبدا را بنویسید یا انتخاب کنید" className="w-full pr-8 pl-9 py-2.5 bg-transparent text-sm outline-none" />
<button type="button" onClick={(event) => { window.startPicking('start') }} className="absolute inset-y-0 left-0 px-2 text-gray-400 hover:text-blue-600"><i className="fa-solid fa-crosshairs"></i></button>
<div id="suggest-start" className="suggest-box"></div>
</div>
<div className="border-t border-dashed border-gray-200 mx-2"></div>
<div className="relative">
<span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-red-500"><i className="fa-solid fa-location-dot text-xs"></i></span>
<input id="dest-point" type="text" autoComplete="off" placeholder="مقصد را بنویسید یا انتخاب کنید" className="w-full pr-8 pl-9 py-2.5 bg-transparent text-sm outline-none" />
<button type="button" onClick={(event) => { window.startPicking('dest') }} className="absolute inset-y-0 left-0 px-2 text-gray-400 hover:text-red-500"><i className="fa-solid fa-crosshairs"></i></button>
<div id="suggest-dest" className="suggest-box"></div>
</div>
</div>
<button onClick={(event) => { window.swapPoints() }} className="p-2 text-gray-600 hover:text-blue-600"><i className="fa-solid fa-arrow-right-arrow-left rotate-90 text-lg"></i></button>
</div>
<div id="saved-places" className="flex items-center gap-3 border-b border-gray-100 pb-3"></div>
<div>
<div className="text-xs text-gray-500 mb-2">نوع مسیر را انتخاب کنید</div>
<div className="grid grid-cols-2 gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1">
<button id="mode-time" onClick={(event) => { window.setRouteMode('time') }}>کمترین زمان</button>
<button id="mode-cost" onClick={(event) => { window.setRouteMode('cost') }}>کمترین هزینه</button>
</div>
</div>
<div id="road-panel" className="space-y-3"></div>
</div>

<div id="route-steps-view" className="hidden flex-col h-full bg-white relative z-30">
<div className="flex items-center p-4 border-b border-gray-100 shadow-sm cursor-pointer hover:bg-gray-50 transition" onClick={(event) => { window.hideRouteSteps() }}>
<i className="fa-solid fa-arrow-right text-gray-600 ml-2"></i>
<span className="font-bold text-gray-800 text-sm">بازگشت</span>
</div>
<div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
<div className="text-right">
<div id="steps-route-title" className="font-bold text-gray-800 text-sm mb-1.5"></div>
<div className="text-xs text-gray-600 flex items-center gap-2">
<span id="steps-route-dist"></span>
<span className="w-1 h-1 rounded-full bg-gray-300"></span>
<span id="steps-route-time"></span>
</div>
</div>
<div className="w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm">
<i id="steps-route-icon" className="text-gray-500 text-lg"></i>
</div>
</div>
<div className="px-4 py-3 border-b border-gray-100"><div className="text-sm font-bold text-gray-800">گام‌های مسیر</div></div>
<div id="steps-list" className="flex-1 overflow-y-auto slim-scroll px-4 py-2 space-y-0 pb-10"></div>
</div>

<div id="saved-places-view" className="hidden flex-col h-full bg-white relative z-30">
<div className="flex items-center gap-3 p-4 border-b border-gray-100 shadow-sm">
<button onClick={(event) => { window.hideSavedPlacesView() }} className="text-gray-500 hover:text-gray-800 p-1"><i className="fa-solid fa-arrow-right"></i></button>
<div className="flex-1 bg-gray-100 rounded-full flex items-center px-4 py-2 gap-2">
<input type="text" placeholder="جستجوی مکان‌های شخصی" className="bg-transparent text-sm outline-none w-full text-right" dir="rtl" />
<i className="fa-solid fa-magnifying-glass text-gray-400 text-sm"></i>
</div>
</div>
<div id="extended-saved-list" className="flex-1 overflow-y-auto slim-scroll pb-10"></div>
</div>
</aside>
  );
}

export function HamsafarPanel() {
  return (
    <aside id="hamsafar-panel" className="hidden fixed top-0 bottom-0 right-16 w-[420px] max-w-[calc(100vw-4rem)] bg-white z-40 shadow-2xl overflow-hidden border-l border-gray-200 flex-col">
<div className="p-4 border-b border-gray-100 flex items-center justify-between shadow-sm shrink-0 bg-white">
<h2 className="font-bold text-gray-800 text-base text-center w-full justify-center">همسفر</h2>
<button onClick={(event) => { window.closeHamsafarPanel() }} className="text-gray-500 hover:text-gray-900 p-1 transition absolute left-4"><i className="fa-solid fa-xmark text-lg"></i></button>
</div>
<div className="p-4 flex-1 flex flex-col gap-4 overflow-hidden">

<div className="border border-gray-200 rounded-2xl p-2 flex flex-col gap-2 shadow-sm shrink-0">
<div className="flex items-center gap-2">
<div className="flex-1 min-w-0">
<div className="relative">
<span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-blue-600"><i className="fa-regular fa-circle text-xs"></i></span>
<input id="h-start-point" type="text" autoComplete="off" placeholder="مبدا را بنویسید یا انتخاب کنید" className="w-full pr-8 pl-9 py-2 bg-transparent text-sm outline-none" />
<button type="button" onClick={(event) => { window.startPicking('h-start') }} className="absolute inset-y-0 left-0 px-2 text-gray-400 hover:text-blue-600"><i className="fa-solid fa-crosshairs"></i></button>
<div id="suggest-h-start" className="suggest-box"></div>
</div>
<div className="border-t border-dashed border-gray-200 mx-2"></div>
<div className="relative">
<span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-red-500"><i className="fa-solid fa-location-dot text-xs"></i></span>
<input id="h-dest-point" type="text" autoComplete="off" placeholder="مقصد را بنویسید یا انتخاب کنید" className="w-full pr-8 pl-9 py-2 bg-transparent text-sm outline-none" />
<button type="button" onClick={(event) => { window.startPicking('h-dest') }} className="absolute inset-y-0 left-0 px-2 text-gray-400 hover:text-red-500"><i className="fa-solid fa-crosshairs"></i></button>
<div id="suggest-h-dest" className="suggest-box"></div>
</div>
</div>
<button onClick={(event) => { window.swapPoints() }} className="p-2 text-gray-600 hover:text-blue-600"><i className="fa-solid fa-arrow-right-arrow-left rotate-90 text-lg"></i></button>
</div>

<div className="mt-1 pt-2 border-t border-gray-100">
<div className="flex bg-gray-100 p-1 rounded-lg">
<button id="btn-time-now" onClick={(event) => { window.toggleScheduleMode('now') }} className="flex-1 text-[11px] font-bold py-1.5 rounded-md bg-white shadow text-blue-600 transition">همین الان</button>
<button id="btn-time-later" onClick={(event) => { window.toggleScheduleMode('later') }} className="flex-1 text-[11px] font-medium py-1.5 rounded-md text-gray-500 hover:text-gray-700 transition">برنامه‌ریزی</button>
</div>
<div id="schedule-picker" className="hidden gap-2 mt-2">
<select id="schedule-date" className="flex-1 bg-white border border-gray-200 rounded-lg text-xs p-2 outline-none focus:border-blue-400 cursor-pointer">
<option value="today">امروز</option>
<option value="tomorrow">فردا</option>
<option value="day_after">پس‌فردا</option>
</select>
<input type="time" id="schedule-time" className="flex-1 bg-white border border-gray-200 rounded-lg text-xs p-2 outline-none focus:border-blue-400 cursor-pointer" dir="ltr" />
</div>
<button id="btn-create-planned" onClick={(event) => { window.createPlannedRequest() }} className="hidden w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg shadow transition text-xs"><i className="fa-solid fa-calendar-plus ml-1"></i> ایجاد درخواست</button>
</div>
</div>

<div className="grid grid-cols-3 gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1 shadow-sm mt-1 shrink-0">
<button id="htab-nearby" onClick={(event) => { window.switchHTab('nearby') }} className="py-2 rounded-lg text-[11px] font-bold bg-blue-600 text-white shadow transition">افراد مشابه</button>
<button id="htab-accepted" onClick={(event) => { window.switchHTab('accepted') }} className="py-2 rounded-lg text-[11px] font-medium text-gray-600 hover:bg-gray-100 transition">درخواست‌های شما</button>
<button id="htab-group" onClick={(event) => { window.switchHTab('group') }} className="py-2 rounded-lg text-[11px] font-medium text-gray-600 hover:bg-gray-100 transition">گروه همسفر</button>
</div>

<div id="hcontent-nearby" className="flex-1 flex flex-col gap-3 mt-1 overflow-y-auto slim-scroll">
<p className="text-xs text-gray-500 shrink-0" id="person-mode-desc">مبدا و مقصد خود را وارد کنید تا همسفران نشان داده شوند.</p>
<div id="travelers-list" className="space-y-2 pb-6"></div>
<div id="h-selected-person-panel" className="hidden space-y-4 border border-blue-200 rounded-xl p-3 bg-blue-50/30 shrink-0">
<div id="panel-group-members" className="space-y-2"></div>
<div id="request-status-box" className="hidden bg-amber-50 border border-amber-200 p-2 rounded-lg text-xs flex items-center gap-2"></div>
<div className="flex gap-2">
<button onClick={(event) => { window.sendRideRequest() }} id="btn-send-req" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg shadow transition text-xs"><i className="fa-solid fa-paper-plane mr-1"></i> ارسال درخواست</button>
<button onClick={(event) => { window.cancelOrNevermind() }} id="btn-cancel-req" className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg transition text-xs">انصراف</button>
</div>
</div>
</div>

<div id="hcontent-accepted" className="hidden flex-1 flex flex-col gap-4 mt-1 overflow-y-auto slim-scroll">
<div id="incoming-requests-container" className="hidden flex-col gap-2 bg-white border border-blue-200 rounded-xl p-3 shadow-sm shrink-0">
<h3 className="font-bold text-blue-700 text-xs border-b border-blue-100 pb-2 mb-1"><i className="fa-solid fa-inbox mr-1"></i> درخواست‌های دریافتی</h3>
<div id="incoming-requests-list" className="space-y-2 max-h-48 overflow-y-auto slim-scroll"></div>
</div>
<div id="planned-requests-container" className="hidden flex-col gap-2 bg-white border border-emerald-200 rounded-xl p-3 shadow-sm shrink-0">
<h3 className="font-bold text-emerald-700 text-xs border-b border-emerald-100 pb-2 mb-1"><i className="fa-solid fa-calendar-check ml-1"></i> درخواست‌های برنامه‌ریزی‌شده شما</h3>
<div id="planned-requests-list" className="space-y-2"></div>
</div>
<div id="accepted-requests-container">
<p id="accepted-requests-title" className="text-xs text-gray-500 mb-2 shrink-0 border-b border-gray-200 pb-2">وضعیت فعلی همسفران شما:</p>
<div id="h-accepted-list" className="space-y-2 pb-6"></div>
</div>
</div>

<div id="hcontent-group" className="hidden flex-1 flex-col relative mt-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
<div id="h-chat-empty" className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-gray-50 h-full">
<div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center text-3xl mb-4"><i className="fa-solid fa-comments"></i></div>
<h3 className="font-bold text-gray-800 mb-2">گروهی برای نمایش نیست</h3>
<p className="text-xs text-gray-500 leading-relaxed">وقتی با کسی همسفر شدی، اینجا برات گروه ساخته میشه تا بتونید راحت‌تر برای مسیر و زمان حرکت هماهنگ کنید.</p>
</div>
<div id="h-chat-active" className="hidden flex-col w-full h-full">
<div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white shadow-sm z-10 shrink-0">
<div className="flex items-center gap-2 cursor-pointer" onClick={(event) => { window.openGroupInfo() }}>
<span className="font-bold text-gray-800 text-sm py-1">گروه همسفر</span>
</div>
<div className="relative">
<button onClick={(event) => { window.toggleGroupMenu('chat-menu', event) }} className="text-gray-600 p-1.5 hover:bg-gray-100 rounded-full transition"><i className="fa-solid fa-ellipsis-vertical"></i></button>
<div id="chat-menu" className="hidden absolute left-0 top-10 w-36 bg-white shadow-lg rounded-lg border border-gray-100 z-50 py-1">
<button className="w-full text-right px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"><i className="fa-solid fa-search w-4 text-center"></i> جستجو</button>
<button className="w-full text-right px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"><i className="fa-solid fa-circle-exclamation w-4 text-center"></i> گزارش</button>
<button onClick={(event) => { window.leaveGroup() }} className="w-full text-right px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"><i className="fa-solid fa-arrow-right-from-bracket w-4 text-center"></i> ترک گروه</button>
</div>
</div>
</div>
<div id="h-chat-messages" className="flex-1 overflow-y-auto hide-scroll bg-[#e5e5e5] p-3 space-y-3 flex flex-col">
<div className="text-center text-[10px] text-gray-500 my-1 bg-white/60 mx-auto px-2 py-0.5 rounded-full">به گروه همسفران خوش آمدید</div>
</div>
<form onSubmit={(event) => { event.preventDefault(); window.sendChatMessage(); }} className="flex items-center gap-2 p-2 bg-white border-t border-gray-200 shrink-0">
<button type="button" onClick={(event) => { window.convertToPermanentGroup() }} className="w-8 h-8 rounded-full border border-gray-300 text-gray-400 hover:text-purple-600 flex items-center justify-center transition shrink-0" title="ذخیره به عنوان گروه دائمی"><i className="fa-solid fa-plus text-sm"></i></button>
<input type="text" id="h-chat-input" className="flex-1 bg-transparent text-sm outline-none px-1" placeholder="پیام..." />
<button type="button" className="text-gray-400 hover:text-gray-600 px-2 py-1 transition shrink-0"><i className="fa-regular fa-face-smile text-xl"></i></button>
<button type="submit" className="hidden"></button>
</form>
</div>
<div id="h-chat-info" className="hidden flex-col w-full h-full absolute inset-0 z-20 bg-gray-50 overflow-y-auto slim-scroll">
<div className="flex items-center justify-between p-3 bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10 shrink-0">
<button onClick={(event) => { window.closeGroupInfo() }} className="text-gray-600 p-1.5 hover:bg-gray-100 rounded-full transition"><i className="fa-solid fa-arrow-right text-lg"></i></button>
<span className="font-bold text-gray-800 text-base">گروه همسفر</span>
<div className="relative">
<button onClick={(event) => { window.leaveGroup() }} className="text-red-500 p-1.5 hover:bg-red-50 rounded-full transition" title="ترک گروه">
<i className="fa-solid fa-arrow-right-from-bracket text-lg"></i>
</button>
</div>
</div>
<div className="bg-white flex-1 p-3">
<div id="group-members-list" className="space-y-3 pb-6"></div>
</div>
</div>
</div>
</div>
</aside>
  );
}

export function PermanentGroupsPanel() {
  return (
    <aside id="groups-panel" className="hidden fixed top-0 bottom-0 right-16 w-[420px] max-w-[calc(100vw-4rem)] bg-white z-40 shadow-2xl overflow-hidden border-l border-gray-200 flex-col">

<div id="perm-groups-list-view" className="flex flex-col h-full bg-white">
<div className="p-4 border-b border-gray-100 flex items-center justify-between shadow-sm shrink-0 bg-white">
<h2 className="font-bold text-gray-800 text-base text-center w-full">گروه‌های من</h2>
<button onClick={(event) => { window.closePermGroupsPanel() }} className="text-gray-500 hover:text-gray-900 p-1 transition absolute left-4"><i className="fa-solid fa-xmark text-lg"></i></button>
</div>
<div className="p-3 bg-gray-50 border-b border-gray-100 shrink-0">
<div className="bg-white rounded-full border border-gray-200 flex items-center px-3 h-9 gap-2">
<i className="fa-solid fa-magnifying-glass text-gray-400 text-xs"></i>
<input type="text" placeholder="جستجوی گروه..." className="flex-1 bg-transparent outline-none text-xs" />
</div>
</div>
<div id="perm-groups-list-container" className="flex-1 overflow-y-auto slim-scroll">

</div>
</div>

<div id="perm-groups-chat-view" className="hidden flex-col h-full bg-white relative">
<div className="flex items-center justify-between p-3 bg-white border-b border-gray-100 shadow-sm z-10 shrink-0">
<div className="flex items-center gap-3">
<button onClick={(event) => { window.closePermChat() }} className="text-gray-600 p-1.5 hover:bg-gray-100 rounded-full transition"><i className="fa-solid fa-arrow-right text-lg"></i></button>
<img id="perm-chat-avatar" src="" className="w-10 h-10 rounded-full object-cover border border-gray-200 cursor-pointer" onClick={(event) => { window.openPermGroupDetail() }} />
<div className="flex flex-col cursor-pointer" onClick={(event) => { window.openPermGroupDetail() }}>
<span id="perm-chat-title" className="font-bold text-gray-800 text-sm hover:underline"></span>
<span id="perm-chat-subtitle" className="text-[10px] text-gray-500"></span>
</div>
</div>
<div class="relative">
    <button onclick="togglePermChatMenu(event)" class="text-gray-600 p-1.5 hover:bg-gray-100 rounded-full transition">
        <i class="fa-solid fa-ellipsis-vertical text-lg"></i>
    </button>
    <div id="perm-chat-menu" class="hidden absolute left-0 top-10 w-40 bg-white shadow-lg rounded-lg border border-gray-100 z-50 py-1">
        <button onclick="leavePermGroup()" class="w-full text-right px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2">
            <i class="fa-solid fa-arrow-right-from-bracket w-4 text-center"></i> ترک گروه
        </button>
        <button id="btn-delete-perm-group" onclick="deletePermGroup()" class="hidden w-full text-right px-3 py-2 text-xs text-red-600 hover:bg-red-50 items-center gap-2 border-t border-red-100 mt-1 pt-1">
            <i class="fa-solid fa-trash w-4 text-center"></i> حذف گروه
        </button>
    </div>
</div></div>
<div id="perm-chat-messages" className="flex-1 overflow-y-auto hide-scroll bg-[#e5e5e5] p-3 space-y-3 flex flex-col">

</div>
<form onSubmit={(event) => { event.preventDefault(); window.sendPermChatMessage(); }} className="flex items-center gap-2 p-2 bg-white border-t border-gray-200 shrink-0">
<button type="button" className="text-gray-400 hover:text-gray-600 px-2 py-1 transition shrink-0"><i className="fa-solid fa-paperclip text-lg"></i></button>
<input type="text" id="perm-chat-input" className="flex-1 bg-transparent text-sm outline-none px-1" placeholder="پیام..." />
<button type="submit" className="hidden"></button>
</form>
</div>
<div id="perm-group-detail-view" className="hidden flex-col w-full h-full absolute inset-0 z-20 bg-gray-50 overflow-y-auto slim-scroll">
<div className="flex items-center gap-4 p-3 bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10 shrink-0">
<button onClick={(event) => { window.closePermGroupDetail() }} className="text-gray-600 p-1.5 hover:bg-gray-100 rounded-full transition"><i className="fa-solid fa-arrow-right text-lg"></i></button>
<span className="font-bold text-gray-800 text-base">اطلاعات گروه</span>
</div>
<div className="bg-white p-6 text-center border-b border-gray-200 shrink-0">
<div className="flex items-center justify-center gap-2 group">
<h2 id="detail-group-name" className="font-bold text-xl text-gray-800 border-b-2 border-transparent"></h2>
<button id="edit-group-name-btn" className="hidden text-gray-400 hover:text-blue-600 p-1 transition" onClick={(event) => { window.toggleGroupNameEdit() }}>
<i className="fa-solid fa-pen text-sm"></i>
</button>
</div>
<div id="edit-group-name-container" className="hidden flex-col items-center gap-2 mt-2">
<input type="text" id="edit-group-name-input" className="border border-blue-400 rounded-lg px-3 py-1.5 text-sm outline-none w-3/4 text-center" />
<div className="flex gap-2">
<button onClick={(event) => { window.saveGroupName() }} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded-md shadow-sm">ذخیره</button>
<button onClick={(event) => { window.toggleGroupNameEdit() }} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-md">انصراف</button>
</div>
</div>
<p id="detail-group-count" className="text-xs text-gray-500 mt-2"></p>
</div>
<div className="bg-white mt-2 p-3 border-y border-gray-200 shrink-0">
<div className="flex justify-between items-center py-2">
<div className="flex flex-col">
<span className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">لینک دعوت</span>
<a href="#" className="text-sm text-blue-600 hover:underline">https://t.me/goftegoosh...</a>
<span className="text-xs text-gray-500 mt-1">Link</span>
</div>
<i className="fa-solid fa-qrcode text-gray-400 text-lg cursor-pointer"></i>
</div>
</div>
<div className="bg-white mt-2 p-3 border-y border-gray-200 shrink-0">
<div className="flex justify-between items-center py-1">
<span className="text-sm font-medium text-gray-800">اعلان‌ها (Notifications)</span>
<label className="relative inline-flex items-center cursor-pointer">
<input type="checkbox" defaultValue="" className="sr-only peer" defaultChecked={true} />
<div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
</label>
</div>
</div>
<div className="bg-white mt-2 flex-1 border-t border-gray-200">
<div className="flex text-xs font-bold text-gray-400 border-b border-gray-100 px-4 pt-3 pb-2">
<span className="text-blue-600 border-b-2 border-blue-600 pb-2 cursor-default">اعضا (Members)</span>
</div>
<div className="flex items-center gap-3 p-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition">
<div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
<i className="fa-solid fa-user-plus"></i>
</div>
<span className="font-bold text-sm text-blue-600">افزودن عضو جدید</span>
</div>
<div id="detail-members-list" className="pb-6">

</div>
</div>
</div>
</aside>
  );
}

export function MapTools() {
  return (
    <div className="fixed bottom-14 left-5 z-20 rounded-xl overflow-hidden shadow-lg bg-white flex flex-col">
<button onClick={(event) => { window.map.zoomIn() }} className="zoom-btn" title="بزرگنمایی"><i className="fa-solid fa-plus"></i></button>
<div style={{ height: "1px", background: "#e5e7eb" }}></div>
<button onClick={(event) => { window.map.zoomOut() }} className="zoom-btn" title="کوچک‌نمایی"><i className="fa-solid fa-minus"></i></button>
<div style={{ height: "1px", background: "#e5e7eb" }}></div>
<button onClick={(event) => { window.locateMe() }} className="zoom-btn" title="موقعیت من"><i className="fa-solid fa-location-crosshairs"></i></button>
</div>
  );
}

export function IncomingRequestModal() {
  return (
    <div id="incoming-req-modal" style={{ display: "none", position: "fixed", inset: "0", backgroundColor: "rgba(0,0,0,.5)", zIndex: "10000", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
<div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative border border-gray-100 mx-4 text-center">
<div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto text-3xl mb-3 shadow-inner"><i className="fa-solid fa-bell"></i></div>
<h3 className="font-bold text-gray-800 text-lg mb-1">درخواست همسفری جدید!</h3>
<p className="text-sm text-gray-600 leading-relaxed mb-6" id="incoming-req-text">شما درخواست‌های جدیدی برای همسفری دارید.</p>
<button onClick={(event) => { window.viewRequests() }} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl shadow transition text-sm">مشاهده (View)</button>
</div>
</div>
  );
}

export function ConfirmationModal() {
  return (
    <div id="confirm-modal" style={{ display: "none", position: "fixed", inset: "0", backgroundColor: "rgba(0,0,0,.5)", zIndex: "10000", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
<div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative border border-gray-100 mx-4 text-center">
<div id="confirm-icon-box" className="w-16 h-16 rounded-full flex items-center justify-center mx-auto text-3xl mb-4 shadow-inner bg-red-50 text-red-500">
<i id="confirm-icon" className="fa-solid fa-triangle-exclamation"></i>
</div>
<h3 id="confirm-title" className="font-bold text-gray-800 text-lg mb-2">تایید</h3>
<p id="confirm-desc" className="text-sm text-gray-600 leading-relaxed mb-6">آیا مطمئن هستید؟</p>
<div className="flex gap-3">
<button id="confirm-yes-btn" className="flex-1 font-medium py-2.5 rounded-xl shadow transition text-sm text-white bg-red-500 hover:bg-red-600">بله</button>
<button onClick={(event) => { window.closeConfirmModal() }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl transition text-sm">انصراف</button>
</div>
</div>
</div>
  );
}

export function AuthModal() {
  return (
    <div id="auth-modal" style={{ display: "none", position: "fixed", inset: "0", backgroundColor: "rgba(0,0,0,.5)", zIndex: "9999", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
<div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative border border-gray-100 mx-4">
<button onClick={(event) => { window.closeAuthModal() }} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600"><i className="fa-solid fa-xmark text-lg"></i></button>
<div className="flex border-b border-gray-200 mb-6 pb-2 gap-4">
<button onClick={(event) => { window.switchAuthTab('login') }} id="tab-login" className="font-bold text-blue-600 border-b-2 border-blue-600 pb-1 text-sm transition">ورود به حساب</button>
<button onClick={(event) => { window.switchAuthTab('signup') }} id="tab-signup" className="font-medium text-gray-500 pb-1 text-sm transition">ثبت‌نام جدید</button>
</div>
<div id="form-login" className="space-y-4">
<div>
<label className="block text-xs font-medium text-gray-700 mb-1">شماره موبایل</label>
<input type="text" id="login-phone" placeholder="09123456789" className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-xl text-sm outline-none" dir="ltr" />
</div>
<button onClick={(event) => { window.handleLogin() }} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl shadow transition text-sm">ورود به سامانه</button>
</div>
<div id="form-signup" className="hidden space-y-3">
<div className="grid grid-cols-2 gap-2">
<div>
<label className="block text-xs font-medium text-gray-700 mb-1">نام *</label>
<input type="text" id="signup-name" placeholder="مثلاً علی" className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-sm outline-none" />
</div>
<div>
<label className="block text-xs font-medium text-gray-700 mb-1">نام خانوادگی *</label>
<input type="text" id="signup-family" placeholder="مثلاً کریمی" className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-sm outline-none" />
</div>
</div>
<div>
<label className="block text-xs font-medium text-gray-700 mb-1">شماره موبایل *</label>
<input type="text" id="signup-phone" placeholder="09123456789" className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-xl text-sm outline-none" dir="ltr" />
</div>
<div>
<label className="block text-xs font-medium text-gray-700 mb-1">تاریخ تولد *</label>
<div className="grid grid-cols-3 gap-2" dir="ltr">
<select id="signup-year" className="px-2 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"><option value="">سال</option></select>
<select id="signup-month" className="px-2 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500">
<option value="">ماه</option>
<option value="01">فروردین</option><option value="02">اردیبهشت</option><option value="03">خرداد</option>
<option value="04">تیر</option><option value="05">مرداد</option><option value="06">شهریور</option>
<option value="07">مهر</option><option value="08">آبان</option><option value="09">آذر</option>
<option value="10">دی</option><option value="11">بهمن</option><option value="12">اسفند</option>
</select>
<select id="signup-day" className="px-2 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"><option value="">روز</option></select>
</div>
</div>
<div>
<label className="block text-xs font-medium text-gray-700 mb-1">تصویر پروفایل (اختیاری)</label>
<input type="file" id="signup-avatar-file" accept="image/*" className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer" />
</div>
<button onClick={(event) => { window.handleSignup() }} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-xl shadow transition text-sm mt-2">تایید و ثبت‌نام</button>
</div>
</div>
</div>
  );
}
