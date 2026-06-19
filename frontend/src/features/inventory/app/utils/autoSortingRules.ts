// Auto-Sorting Rules for Inventory Items

export interface AutoSortResult {
  category: string;
  subcategory: string;
  targetCustomer: 'Male' | 'Female' | 'Unisex';
  confidence: 'high' | 'medium' | 'low';
  suggestedCondition?: 'Excellent' | 'Good' | 'Fair' | 'Damaged';
}

// Keyword mappings for categories and subcategories
const categoryRules: {
  [key: string]: {
    keywords: string[];
    subcategories: {
      [key: string]: {
        keywords: string[];
        targetCustomer?: 'Male' | 'Female' | 'Unisex';
      };
    };
  };
} = {
  'Tops': {
    keywords: ['shirt', 'top', 'blouse', 'tee', 'polo', 'tank', 'sweater', 'hoodie'],
    subcategories: {
      'T-Shirts': {
        keywords: ['t-shirt', 'tshirt', 'tee', 'graphic tee', 'basic tee', 'cotton tee', 'vintage tee'],
        targetCustomer: 'Unisex'
      },
      'Polo Shirts': {
        keywords: ['polo', 'polo shirt', 'collared shirt', 'golf shirt'],
        targetCustomer: 'Male'
      },
      'Blouses': {
        keywords: ['blouse', 'silk blouse', 'chiffon', 'ruffle', 'peasant'],
        targetCustomer: 'Female'
      },
      'Tank Tops': {
        keywords: ['tank', 'tank top', 'sleeveless', 'racerback', 'muscle tank', 'sando'],
        targetCustomer: 'Unisex'
      }
    }
  },
  'Bottoms': {
    keywords: ['pants', 'jeans', 'shorts', 'skirt', 'trousers', 'slacks'],
    subcategories: {
      'Jeans': {
        keywords: ['jeans', 'denim', 'levis', 'skinny jeans', 'mom jeans', 'boyfriend jeans', 'high-waisted jeans'],
        targetCustomer: 'Unisex'
      },
      'Pants': {
        keywords: ['pants', 'trousers', 'slacks', 'cargo', 'chinos', 'khaki', 'joggers', 'dress pants'],
        targetCustomer: 'Unisex'
      },
      'Shorts': {
        keywords: ['shorts', 'bermuda', 'cycling shorts', 'cargo shorts', 'denim shorts'],
        targetCustomer: 'Unisex'
      },
      'Skirts': {
        keywords: ['skirt', 'mini skirt', 'maxi skirt', 'midi skirt', 'pleated', 'pencil skirt', 'a-line'],
        targetCustomer: 'Female'
      }
    }
  },
  'Dresses': {
    keywords: ['dress', 'gown', 'frock', 'sundress'],
    subcategories: {
      'Casual Dresses': {
        keywords: ['casual dress', 'sundress', 'day dress', 'shirt dress', 'wrap dress', 'shift dress'],
        targetCustomer: 'Female'
      },
      'Formal Dresses': {
        keywords: ['formal dress', 'evening dress', 'cocktail dress', 'gown', 'party dress', 'prom dress'],
        targetCustomer: 'Female'
      }
    }
  },
  'Outerwear': {
    keywords: ['jacket', 'coat', 'blazer', 'cardigan', 'hoodie', 'sweater', 'vest'],
    subcategories: {
      'Jackets': {
        keywords: ['jacket', 'denim jacket', 'leather jacket', 'bomber', 'windbreaker', 'puffer', 'blazer'],
        targetCustomer: 'Unisex'
      },
      'Hoodies & Sweaters': {
        keywords: ['hoodie', 'sweater', 'pullover', 'cardigan', 'knit', 'sweatshirt', 'fleece'],
        targetCustomer: 'Unisex'
      }
    }
  },
  'Shoes': {
    keywords: ['shoe', 'sneaker', 'boot', 'sandal', 'slipper', 'heel', 'loafer'],
    subcategories: {
      'Sneakers': {
        keywords: ['sneaker', 'running shoe', 'trainer', 'athletic shoe', 'canvas shoe', 'tennis shoe'],
        targetCustomer: 'Unisex'
      },
      'Boots': {
        keywords: ['boot', 'ankle boot', 'combat boot', 'chelsea boot', 'hiking boot', 'work boot'],
        targetCustomer: 'Unisex'
      },
      'Sandals': {
        keywords: ['sandal', 'flip flop', 'slipper', 'slide', 'thong', 'gladiator'],
        targetCustomer: 'Unisex'
      }
    }
  },
  'Accessories': {
    keywords: ['bag', 'hat', 'cap', 'belt', 'scarf', 'jewelry', 'watch', 'sunglasses'],
    subcategories: {
      'Bags': {
        keywords: ['bag', 'purse', 'handbag', 'backpack', 'tote', 'crossbody', 'clutch', 'satchel', 'messenger'],
        targetCustomer: 'Unisex'
      },
      'Hats': {
        keywords: ['hat', 'cap', 'beanie', 'baseball cap', 'bucket hat', 'fedora', 'sun hat'],
        targetCustomer: 'Unisex'
      }
    }
  }
};

// Gender-specific keywords
const maleKeywords = [
  'men', 'mens', "men's", 'male', 'boy', 'boys', 'gentleman', 'masculine',
  'polo', 'suit', 'tie', 'tux', 'tuxedo', 'cargo', 'boardshorts'
];

const femaleKeywords = [
  'women', 'womens', "women's", 'female', 'girl', 'girls', 'lady', 'ladies', 'feminine',
  'blouse', 'dress', 'skirt', 'gown', 'bra', 'lingerie', 'maternity', 'heel', 'heels'
];

// Condition assessment keywords
const conditionKeywords = {
  'Excellent': ['new', 'mint', 'pristine', 'excellent', 'perfect', 'unused', 'tags on', 'brand new'],
  'Good': ['good', 'great', 'nice', 'clean', 'quality', 'solid', 'gently used', 'barely worn'],
  'Fair': ['fair', 'used', 'worn', 'some wear', 'minor', 'slight', 'acceptable', 'ok'],
  'Damaged': ['damaged', 'torn', 'ripped', 'stained', 'broken', 'defect', 'hole', 'faded', 'worn out']
};

/**
 * Auto-categorize an item based on its name/description
 */
export function autoSortItem(itemName: string, description?: string): AutoSortResult {
  const searchText = `${itemName} ${description || ''}`.toLowerCase();

  let category = '';
  let subcategory = '';
  let targetCustomer: 'Male' | 'Female' | 'Unisex' = 'Unisex';
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let suggestedCondition: 'Excellent' | 'Good' | 'Fair' | 'Damaged' | undefined;

  // 1. Detect Category
  for (const [cat, rules] of Object.entries(categoryRules)) {
    const categoryMatch = rules.keywords.some(keyword => searchText.includes(keyword));
    if (categoryMatch) {
      category = cat;
      confidence = 'medium';

      // 2. Detect Subcategory within matched category
      for (const [subcat, subrules] of Object.entries(rules.subcategories)) {
        const subcategoryMatch = subrules.keywords.some(keyword => searchText.includes(keyword));
        if (subcategoryMatch) {
          subcategory = subcat;
          confidence = 'high';

          // Use predefined target customer for this subcategory
          if (subrules.targetCustomer) {
            targetCustomer = subrules.targetCustomer;
          }
          break;
        }
      }
      break;
    }
  }

  // 3. Detect Target Customer (Male/Female/Unisex) if not already set
  if (targetCustomer === 'Unisex') {
    const hasMaleKeywords = maleKeywords.some(keyword => searchText.includes(keyword));
    const hasFemaleKeywords = femaleKeywords.some(keyword => searchText.includes(keyword));

    if (hasFemaleKeywords && !hasMaleKeywords) {
      targetCustomer = 'Female';
    } else if (hasMaleKeywords && !hasFemaleKeywords) {
      targetCustomer = 'Male';
    }
    // Otherwise stays Unisex
  }

  // 4. Suggest Condition based on description keywords
  for (const [condition, keywords] of Object.entries(conditionKeywords)) {
    const hasConditionKeyword = keywords.some(keyword => searchText.includes(keyword));
    if (hasConditionKeyword) {
      suggestedCondition = condition as 'Excellent' | 'Good' | 'Fair' | 'Damaged';
      break;
    }
  }

  return {
    category: category || 'Uncategorized',
    subcategory: subcategory || 'Other',
    targetCustomer,
    confidence,
    suggestedCondition
  };
}

/**
 * Get condition suggestions based on description
 */
export function suggestCondition(description: string): {
  condition: 'Excellent' | 'Good' | 'Fair' | 'Damaged';
  confidence: 'high' | 'medium' | 'low';
} {
  const searchText = description.toLowerCase();

  for (const [condition, keywords] of Object.entries(conditionKeywords)) {
    const matchCount = keywords.filter(keyword => searchText.includes(keyword)).length;
    if (matchCount > 0) {
      return {
        condition: condition as 'Excellent' | 'Good' | 'Fair' | 'Damaged',
        confidence: matchCount > 1 ? 'high' : 'medium'
      };
    }
  }

  // Default to Good if no keywords found
  return {
    condition: 'Good',
    confidence: 'low'
  };
}

/**
 * Batch auto-sort multiple items
 */
export function batchAutoSort(items: { name: string; description?: string }[]): AutoSortResult[] {
  return items.map(item => autoSortItem(item.name, item.description));
}

/**
 * Get all available categories
 */
export function getAvailableCategories(): string[] {
  return Object.keys(categoryRules);
}

/**
 * Get subcategories for a specific category
 */
export function getSubcategoriesForCategory(category: string): string[] {
  const rules = categoryRules[category];
  return rules ? Object.keys(rules.subcategories) : [];
}
