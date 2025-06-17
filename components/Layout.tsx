import { Fragment } from "react"
import { Disclosure, Menu, Transition } from "@headlessui/react"
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline"
import Link from "next/link"

const navigation = [
  { name: "Dashboard", href: "/", current: true },
  { name: "Scanner", href: "/scanner", current: false },
  { name: "Pair Analyzer", href: "/pair-analyzer", current: false },
  {
    name: "Backtests",
    current: false,
    children: [
      { name: "Price Ratio Model", href: "/backtest", current: false },
      { name: "Dynamic Spread Model", href: "/backtest-spread", current: false },
      { name: "Kalman Filter Model", href: "/backtest-kalman", current: false },
      { name: "Euclidean Distance Model", href: "/backtest-euclidean", current: false }, // New link
    ],
  },
  { name: "Watchlists", href: "/watchlists", current: false },
  { name: "Pricing", href: "/pricing", current: false },
]

function classNames(...classes) {
  return classes.filter(Boolean).join(" ")
}

export default function Layout({ children }) {
  return (
    <>
      <div className="min-h-full">
        <Disclosure as="nav" className="bg-navy-800">
          {({ open }) => (
            <>
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <img className="h-8 w-8" src="/placeholder.svg?height=32&width=32" alt="v0 logo" />
                    </div>
                    <div className="hidden md:block">
                      <div className="ml-10 flex items-baseline space-x-4">
                        {navigation.map((item) =>
                          item.children ? (
                            <Menu as="div" key={item.name} className="relative -m-2 p-2">
                              <Menu.Button className="text-gray-300 hover:bg-navy-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                                {item.name}
                              </Menu.Button>
                              <Transition
                                as={Fragment}
                                enter="transition ease-out duration-100"
                                enterFrom="transform opacity-0 scale-95"
                                enterTo="transform opacity-100 scale-100"
                                leave="transition ease-in duration-75"
                                leaveFrom="transform opacity-100 scale-100"
                                leaveTo="transform opacity-0 scale-95"
                              >
                                <Menu.Items className="absolute left-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-navy-700 py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                                  {item.children.map((child) => (
                                    <Menu.Item key={child.name}>
                                      {({ active }) => (
                                        <Link
                                          href={child.href}
                                          className={classNames(
                                            active ? "bg-navy-600" : "",
                                            "block px-4 py-2 text-sm text-gray-300 hover:text-white",
                                          )}
                                        >
                                          {child.name}
                                        </Link>
                                      )}
                                    </Menu.Item>
                                  ))}
                                </Menu.Items>
                              </Transition>
                            </Menu>
                          ) : (
                            <Link
                              key={item.name}
                              href={item.href}
                              className={classNames(
                                item.current
                                  ? "bg-navy-900 text-white"
                                  : "text-gray-300 hover:bg-navy-700 hover:text-white",
                                "px-3 py-2 rounded-md text-sm font-medium",
                              )}
                              aria-current={item.current ? "page" : undefined}
                            >
                              {item.name}
                            </Link>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="hidden md:block">
                    <div className="ml-4 flex items-center md:ml-6">
                      {/* Profile dropdown */}
                      <Menu as="div" className="relative ml-3">
                        <div>
                          <Menu.Button className="flex max-w-xs items-center rounded-full bg-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800">
                            <span className="sr-only">Open user menu</span>
                            <img
                              className="h-8 w-8 rounded-full"
                              src="/placeholder.svg?height=32&width=32"
                              alt="User avatar"
                            />
                          </Menu.Button>
                        </div>
                        <Transition
                          as={Fragment}
                          enter="transition ease-out duration-100"
                          enterFrom="transform opacity-0 scale-95"
                          enterTo="transform opacity-100 scale-100"
                          leave="transition ease-in duration-75"
                          leaveFrom="transform opacity-100 scale-100"
                          leaveTo="transform opacity-0 scale-95"
                        >
                          <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-navy-700 py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                            <Menu.Item>
                              {({ active }) => (
                                <a
                                  href="#"
                                  className={classNames(
                                    active ? "bg-navy-600" : "",
                                    "block px-4 py-2 text-sm text-gray-300 hover:text-white",
                                  )}
                                >
                                  Your Profile
                                </a>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <a
                                  href="#"
                                  className={classNames(
                                    active ? "bg-navy-600" : "",
                                    "block px-4 py-2 text-sm text-gray-300 hover:text-white",
                                  )}
                                >
                                  Settings
                                </a>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <a
                                  href="#"
                                  className={classNames(
                                    active ? "bg-navy-600" : "",
                                    "block px-4 py-2 text-sm text-gray-300 hover:text-white",
                                  )}
                                >
                                  Sign out
                                </a>
                              )}
                            </Menu.Item>
                          </Menu.Items>
                        </Transition>
                      </Menu>
                    </div>
                  </div>
                  <div className="-mr-2 flex md:hidden">
                    {/* Mobile menu button */}
                    <Disclosure.Button className="inline-flex items-center justify-center rounded-md bg-navy-800 p-2 text-gray-400 hover:bg-navy-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800">
                      <span className="sr-only">Open main menu</span>
                      {open ? (
                        <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                      ) : (
                        <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                      )}
                    </Disclosure.Button>
                  </div>
                </div>
              </div>

              <Disclosure.Panel className="md:hidden">
                <div className="space-y-1 px-2 pt-2 pb-3 sm:px-3">
                  {navigation.map((item) =>
                    item.children ? (
                      <Disclosure as="div" key={item.name} className="space-y-1">
                        <Disclosure.Button className="block w-full text-left text-gray-300 hover:bg-navy-700 hover:text-white px-3 py-2 rounded-md text-base font-medium">
                          {item.name}
                        </Disclosure.Button>
                        <div className="space-y-1 pl-4 pr-3">
                          {item.children.map((child) => (
                            <Disclosure.Link
                              key={child.name}
                              as={Link}
                              href={child.href}
                              className="block text-gray-300 hover:bg-navy-700 hover:text-white px-3 py-2 rounded-md text-base font-medium"
                            >
                              {child.name}
                            </Disclosure.Link>
                          ))}
                        </div>
                      </Disclosure>
                    ) : (
                      <Disclosure.Button
                        key={item.name}
                        as={Link}
                        href={item.href}
                        className={classNames(
                          item.current ? "bg-navy-900 text-white" : "text-gray-300 hover:bg-navy-700 hover:text-white",
                          "block px-3 py-2 rounded-md text-base font-medium",
                        )}
                        aria-current={item.current ? "page" : undefined}
                      >
                        {item.name}
                      </Disclosure.Button>
                    ),
                  )}
                </div>
                <div className="border-t border-gray-700 pt-4 pb-3">
                  <div className="flex items-center px-5">
                    <div className="flex-shrink-0">
                      <img
                        className="h-10 w-10 rounded-full"
                        src="/placeholder.svg?height=40&width=40"
                        alt="User avatar"
                      />
                    </div>
                    <div className="ml-3">
                      <div className="text-base font-medium leading-none text-white">Tom Cook</div>
                      <div className="text-sm font-medium leading-none text-gray-400">tom@example.com</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 px-2">
                    <Disclosure.Button
                      as="a"
                      href="#"
                      className="block rounded-md px-3 py-2 text-base font-medium text-gray-400 hover:bg-navy-700 hover:text-white"
                    >
                      Your Profile
                    </Disclosure.Button>
                    <Disclosure.Button
                      as="a"
                      href="#"
                      className="block rounded-md px-3 py-2 text-base font-medium text-gray-400 hover:bg-navy-700 hover:text-white"
                    >
                      Settings
                    </Disclosure.Button>
                    <Disclosure.Button
                      as="a"
                      href="#"
                      className="block rounded-md px-3 py-2 text-base font-medium text-gray-400 hover:bg-navy-700 hover:text-white"
                    >
                      Sign out
                    </Disclosure.Button>
                  </div>
                </div>
              </Disclosure.Panel>
            </>
          )}
        </Disclosure>

        <main>
          <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </>
  )
}
