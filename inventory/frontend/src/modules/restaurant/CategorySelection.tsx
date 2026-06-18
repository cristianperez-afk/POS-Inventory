import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";

type CategoryGroup = "meat" | "others" | null;

export function CategorySelection() {
  const navigate = useNavigate();
  const [selectedGroup, setSelectedGroup] = useState<CategoryGroup>(null);

  const meatSubcategories = [
    { name: "Pork ba", value: "Pork", icon: "🥓" },
    { name: "Chicken", value: "Poultry", icon: "🍗" },
    { name: "Beef", value: "Beef", icon: "🥩" },
    { name: "Lamb", value: "Lamb", icon: "🍖" },
  ];

  const otherSubcategories = [
    { name: "Fruits", value: "Fruits", icon: "🍎" },
    { name: "Vegetables", value: "Vegetables", icon: "🥬" },
    { name: "Seafood", value: "Seafood", icon: "🐟" },
    { name: "Dairy", value: "Dairy", icon: "🧀" },
    { name: "Bakery", value: "Bakery", icon: "🍞" },
    { name: "Oils & Condiments", value: "Oils & Condiments", icon: "🫗" },
  ];

  const handleGroupClick = (group: CategoryGroup) => {
    setSelectedGroup(group);
  };

  const handleSubcategoryClick = (category: string, subCategory: string) => {
    navigate(`/category?category=${encodeURIComponent(category)}&sub=${encodeURIComponent(subCategory)}`);
  };

  const handleBack = () => {
    if (selectedGroup) {
      setSelectedGroup(null);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        <h1 className="text-xl font-bold text-foreground mb-2">
          {!selectedGroup && "Select Category"}
          {selectedGroup === "meat" && "Select Meat Type"}
          {selectedGroup === "others" && "Select Category"}
        </h1>
        <p className="text-muted-foreground">
          {!selectedGroup && "Choose between meat or other categories"}
          {selectedGroup === "meat" && "Choose the type of meat you want to view"}
          {selectedGroup === "others" && "Choose a category to view"}
        </p>
      </div>

      {/* First Level - Meat or Others */}
      {!selectedGroup && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl">
          <button
            onClick={() => handleGroupClick("meat")}
            className="bg-card rounded-2xl p-1.5 shadow-sm border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200 group"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="text-6xl">🥩</div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <h2 className="text-sm font-bold text-foreground mb-2">Meat</h2>
            <p className="text-muted-foreground">
              Poultry, Beef, Pork, and more
            </p>
          </button>

          <button
            onClick={() => handleGroupClick("others")}
            className="bg-card rounded-2xl p-1.5 shadow-sm border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200 group"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="text-6xl">🛒</div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <h2 className="text-sm font-bold text-foreground mb-2">Others</h2>
            <p className="text-muted-foreground">
              Fruits, Vegetables, Dairy, and more
            </p>
          </button>
        </div>
      )}

      {/* Second Level - Meat Subcategories */}
      {selectedGroup === "meat" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {meatSubcategories.map((subcategory) => (
            <button
              key={subcategory.value}
              onClick={() => handleSubcategoryClick("Meat", subcategory.value)}
              className="bg-card rounded-2xl p-2 shadow-sm border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200 group text-left"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="text-5xl">{subcategory.icon}</div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-xl font-bold text-foreground">{subcategory.name}</h3>
            </button>
          ))}
        </div>
      )}

      {/* Second Level - Other Categories */}
      {selectedGroup === "others" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {otherSubcategories.map((subcategory) => (
            <button
              key={subcategory.value}
              onClick={() => handleSubcategoryClick(subcategory.value, "all")}
              className="bg-card rounded-2xl p-2 shadow-sm border border-border hover:shadow-lg hover:border-primary/50 transition-all duration-200 group text-left"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="text-5xl">{subcategory.icon}</div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-xl font-bold text-foreground">{subcategory.name}</h3>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
