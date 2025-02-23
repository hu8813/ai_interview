import Link from "next/link";

export default function Header() {
    return (
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <nav className="flex items-center justify-between p-4 max-w-7xl mx-auto">
          <Link href="/" className="text-[#1E2B3A] font-semibold">
            Home
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm rounded-full px-4 py-2 text-[#1E2B3A] bg-gray-100 hover:bg-gray-200 transition-all"
            >
              Exit Interview
            </Link>
          </div>
        </nav>
      </header>
    );
  }