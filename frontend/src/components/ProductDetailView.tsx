import { ArrowLeft } from "lucide-react";

interface ProductDetailViewProps {
  onBack: () => void;
}

const ProductDetailView = ({ onBack }: ProductDetailViewProps) => (
  <div className="space-y-4">
    <div className="flex justify-start">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium rounded-full px-4 py-2 transition-colors text-white"
        style={{ backgroundColor: "var(--navy)" }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2a3a5c")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--navy)")}
      >
        <ArrowLeft size={16} />
        Back
      </button>
    </div>
    <div className="flex justify-start">
      <div className="bg-white rounded-2xl px-5 py-3 max-w-sm shadow-sm" style={{ color: "var(--navy)" }}>
        <p className="text-sm">Here are the detailed specifications and reviews.</p>
      </div>
    </div>
    <div className="flex flex-col gap-3 items-start">
      <div className="flex gap-3">
        <div className="w-[120px] h-[100px] bg-gray-200 rounded-xl" />
        <div className="w-[120px] h-[100px] bg-gray-200 rounded-xl" />
      </div>
      <div className="w-full h-32 bg-gray-200 rounded-xl" />
      <div className="bg-white rounded-2xl px-5 py-3 max-w-sm" style={{ color: "var(--navy)" }}>
        <p className="text-sm font-semibold mb-1">Specifications:</p>
        <ul className="text-sm space-y-1 text-gray-600">
          <li>• Driver: 40mm dynamic</li>
          <li>• Battery: Up to 30 hours</li>
          <li>• Connectivity: Bluetooth 5.2</li>
          <li>• Weight: 250g</li>
          <li>• ANC: Yes, adaptive</li>
        </ul>
      </div>
      <button
        className="rounded-full px-6 py-2.5 text-sm font-medium text-white transition-colors flex items-center gap-2"
        style={{ backgroundColor: "var(--navy)" }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2a3a5c")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--navy)")}
      >
        View best price →
      </button>
    </div>
  </div>
);

export default ProductDetailView;
