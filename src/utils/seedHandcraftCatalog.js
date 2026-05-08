const mongoose = require("mongoose");
const slugify = require("slugify");

const connectDB = require("../config/db");
const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const Product = require("../models/Product");

const defaultDeliveryEstimate = {
    minDays: 3,
    maxDays: 7,
    label: "Handcrafted to order",
    shipsFrom: "Artisan Studio",
};

const defaultPolicySurfaces = {
    returnPolicy: "Returns accepted within 14 days for unworn jewelry in original packaging.",
    warrantyPolicy: "Includes a 6-month artisan workmanship warranty.",
    shippingPolicy: "Packed in gift-ready recyclable boxes with tracked shipping.",
};

const handcraftJewelryCatalog = {
    categories: [
        {
            key: "necklaces",
            name: "Necklaces",
            description: "Handcrafted necklaces designed for gifting, layering, and statement styling.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "earrings",
            name: "Earrings",
            description: "Handmade earrings ranging from subtle daily pieces to elevated artisan drops.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "bracelets",
            name: "Bracelets",
            description: "Charm and cuff bracelets built with hand-finished details and durable materials.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "rings",
            name: "Rings",
            description: "Craft jewelry rings with gemstone, stacking, and gift-worthy artisan styles.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "anklets",
            name: "Anklets",
            description: "Lightweight handmade anklets in beaded and chain-based silhouettes.",
            isFeatured: false,
            status: "active",
        },
        {
            key: "brooches-and-pins",
            name: "Brooches & Pins",
            description: "Decorative artisan brooches and pins for scarves, jackets, bags, and gifting.",
            isFeatured: false,
            status: "active",
        },
        {
            key: "hair-jewelry",
            name: "Hair Jewelry",
            description: "Handcrafted hair accessories with floral, pearl, and botanical jewelry finishes.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "bridal-jewelry",
            name: "Bridal Jewelry",
            description: "Wedding-day jewelry sets and coordinated handcrafted accessories.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "mens-jewelry",
            name: "Men's Jewelry",
            description: "Masculine handcrafted jewelry with leather, metal, onyx, and symbolic motifs.",
            isFeatured: false,
            status: "active",
        },
        {
            key: "personalized-jewelry",
            name: "Personalized Jewelry",
            description: "Custom-feel artisan jewelry for initials, birthstones, and meaningful keepsakes.",
            isFeatured: true,
            status: "active",
        },
    ],
    subcategories: [
        {
            key: "pendant-necklaces",
            categoryKey: "necklaces",
            name: "Pendant Necklaces",
            description: "Necklaces centered around handcrafted pendants, stones, and symbolic motifs.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "layered-necklaces",
            categoryKey: "necklaces",
            name: "Layered Necklaces",
            description: "Multi-strand necklaces styled for effortless stacking and texture.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "stud-earrings",
            categoryKey: "earrings",
            name: "Stud Earrings",
            description: "Small handcrafted studs for everyday wear and subtle gifting.",
            isFeatured: false,
            status: "active",
        },
        {
            key: "drop-earrings",
            categoryKey: "earrings",
            name: "Drop Earrings",
            description: "Artisan drop earrings with movement, stones, and decorative detail.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "charm-bracelets",
            categoryKey: "bracelets",
            name: "Charm Bracelets",
            description: "Handmade bracelets finished with symbolic charms and keepsake accents.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "cuff-bracelets",
            categoryKey: "bracelets",
            name: "Cuff Bracelets",
            description: "Open cuff bracelets shaped and textured by hand.",
            isFeatured: false,
            status: "active",
        },
        {
            key: "gemstone-rings",
            categoryKey: "rings",
            name: "Gemstone Rings",
            description: "Statement and occasion rings with handcrafted stone settings.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "stackable-rings",
            categoryKey: "rings",
            name: "Stackable Rings",
            description: "Slim handmade rings designed to be worn solo or stacked together.",
            isFeatured: false,
            status: "active",
        },
        {
            key: "beaded-anklets",
            categoryKey: "anklets",
            name: "Beaded Anklets",
            description: "Colorful anklets with artisan beadwork and lightweight finishing.",
            isFeatured: false,
            status: "active",
        },
        {
            key: "chain-anklets",
            categoryKey: "anklets",
            name: "Chain Anklets",
            description: "Minimal handcrafted anklets with charms and polished chain links.",
            isFeatured: false,
            status: "active",
        },
        {
            key: "floral-brooches",
            categoryKey: "brooches-and-pins",
            name: "Floral Brooches",
            description: "Botanical brooches inspired by handmade petals, enamel, and stitched florals.",
            isFeatured: false,
            status: "active",
        },
        {
            key: "artisan-pins",
            categoryKey: "brooches-and-pins",
            name: "Artisan Pins",
            description: "Creative handcrafted pins for outerwear, tote bags, and personal styling.",
            isFeatured: false,
            status: "active",
        },
        {
            key: "hair-clips",
            categoryKey: "hair-jewelry",
            name: "Hair Clips",
            description: "Decorative handmade clips and barrettes with jewelry-grade finishes.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "hair-vines",
            categoryKey: "hair-jewelry",
            name: "Hair Vines",
            description: "Flexible vine-style hair pieces for bridal and formal styling.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "bridal-sets",
            categoryKey: "bridal-jewelry",
            name: "Bridal Sets",
            description: "Coordinated handcrafted wedding jewelry sets for ceremony styling.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "bridesmaid-jewelry",
            categoryKey: "bridal-jewelry",
            name: "Bridesmaid Jewelry",
            description: "Matching handcrafted gift pieces designed for bridal parties.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "mens-bracelets",
            categoryKey: "mens-jewelry",
            name: "Men's Bracelets",
            description: "Handmade bracelets with leather, stone, and oxidized metal accents.",
            isFeatured: false,
            status: "active",
        },
        {
            key: "mens-pendants",
            categoryKey: "mens-jewelry",
            name: "Men's Pendants",
            description: "Handcrafted pendants with bold shapes, engraving, and symbolic forms.",
            isFeatured: false,
            status: "active",
        },
        {
            key: "initial-jewelry",
            categoryKey: "personalized-jewelry",
            name: "Initial Jewelry",
            description: "Personalized-looking handcrafted pieces featuring initials and monograms.",
            isFeatured: true,
            status: "active",
        },
        {
            key: "birthstone-jewelry",
            categoryKey: "personalized-jewelry",
            name: "Birthstone Jewelry",
            description: "Meaningful handcrafted jewelry centered around birthstone-inspired gems.",
            isFeatured: true,
            status: "active",
        },
    ],
    products: [
        {
            name: "Moonstone Lotus Pendant Necklace",
            sku: "HCJ-NCK-PEN-001",
            price: 68,
            salePrice: 62,
            quantity: 12,
            categoryKey: "necklaces",
            subcategoryKey: "pendant-necklaces",
            description: "Sterling silver lotus pendant necklace with a hand-set moonstone and satin-polished finish.",
            color: "Silver / White",
            material: "Sterling Silver, Moonstone",
            weight: 0.18,
            tags: ["lotus", "moonstone", "gift", "handmade necklace"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Hammered Leaf Turquoise Pendant Necklace",
            sku: "HCJ-NCK-PEN-002",
            price: 72,
            salePrice: 66,
            quantity: 10,
            categoryKey: "necklaces",
            subcategoryKey: "pendant-necklaces",
            description: "Artisan pendant necklace with a hammered leaf silhouette and natural turquoise centerpiece.",
            color: "Antique Gold / Turquoise",
            material: "Brass, Turquoise",
            weight: 0.21,
            tags: ["turquoise", "leaf pendant", "boho", "artisan jewelry"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Boho Pearl Layered Necklace",
            sku: "HCJ-NCK-LAY-001",
            price: 84,
            salePrice: 76,
            quantity: 9,
            categoryKey: "necklaces",
            subcategoryKey: "layered-necklaces",
            description: "Three-layer handmade necklace combining freshwater pearls, chain texture, and a soft boho profile.",
            color: "Gold / Ivory",
            material: "Gold Plated Brass, Freshwater Pearl",
            weight: 0.24,
            tags: ["layered", "pearls", "boho", "statement necklace"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Sunrise Gold Layered Necklace",
            sku: "HCJ-NCK-LAY-002",
            price: 79,
            salePrice: 71,
            quantity: 11,
            categoryKey: "necklaces",
            subcategoryKey: "layered-necklaces",
            description: "Layered necklace with sun medallion detail, fine chains, and warm hand-finished texture.",
            color: "Matte Gold",
            material: "Gold Vermeil, Brass",
            weight: 0.22,
            tags: ["layered necklace", "sun motif", "gift", "gold jewelry"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Rose Quartz Blossom Stud Earrings",
            sku: "HCJ-EAR-STD-001",
            price: 34,
            salePrice: 29,
            quantity: 18,
            categoryKey: "earrings",
            subcategoryKey: "stud-earrings",
            description: "Handmade blossom-shaped studs with rose quartz centers and delicate petal texturing.",
            color: "Rose Gold / Pink",
            material: "Rose Gold Plated Brass, Rose Quartz",
            weight: 0.06,
            tags: ["stud earrings", "rose quartz", "floral", "daily wear"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Tiny Silver Knot Stud Earrings",
            sku: "HCJ-EAR-STD-002",
            price: 28,
            salePrice: 24,
            quantity: 22,
            categoryKey: "earrings",
            subcategoryKey: "stud-earrings",
            description: "Minimal knot studs crafted for everyday styling with a polished sterling silver finish.",
            color: "Silver",
            material: "Sterling Silver",
            weight: 0.04,
            tags: ["minimal", "silver studs", "gift under 30", "everyday jewelry"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Amber Teardrop Macrame Earrings",
            sku: "HCJ-EAR-DRP-001",
            price: 39,
            salePrice: 35,
            quantity: 14,
            categoryKey: "earrings",
            subcategoryKey: "drop-earrings",
            description: "Lightweight artisan drop earrings featuring amber-toned stones and hand-knotted macrame accents.",
            color: "Amber / Bronze",
            material: "Waxed Cord, Brass, Resin Stone",
            weight: 0.09,
            tags: ["drop earrings", "amber", "macrame", "bohemian"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Cascade Pearl Drop Earrings",
            sku: "HCJ-EAR-DRP-002",
            price: 46,
            salePrice: 41,
            quantity: 13,
            categoryKey: "earrings",
            subcategoryKey: "drop-earrings",
            description: "Elegant handmade drop earrings with cascading freshwater pearls and wire-wrapped detail.",
            color: "Ivory / Gold",
            material: "Gold Plated Brass, Freshwater Pearl",
            weight: 0.1,
            tags: ["pearl earrings", "bridal", "drop earrings", "gift"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Garden Charm Bracelet",
            sku: "HCJ-BRC-CHM-001",
            price: 52,
            salePrice: 47,
            quantity: 16,
            categoryKey: "bracelets",
            subcategoryKey: "charm-bracelets",
            description: "Handcrafted bracelet with floral, leaf, and bee charms inspired by cottage garden motifs.",
            color: "Antique Gold",
            material: "Brass, Enamel",
            weight: 0.19,
            tags: ["charm bracelet", "garden", "gift bracelet", "handmade"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Sea Glass Memory Charm Bracelet",
            sku: "HCJ-BRC-CHM-002",
            price: 57,
            salePrice: 52,
            quantity: 15,
            categoryKey: "bracelets",
            subcategoryKey: "charm-bracelets",
            description: "Ocean-inspired bracelet with sea glass tones, shell charms, and handcrafted linked segments.",
            color: "Seafoam / Silver",
            material: "Silver Alloy, Glass, Shell",
            weight: 0.2,
            tags: ["sea glass", "charm bracelet", "beach jewelry", "gift"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Hammered Brass Cuff Bracelet",
            sku: "HCJ-BRC-CUF-001",
            price: 49,
            salePrice: 44,
            quantity: 17,
            categoryKey: "bracelets",
            subcategoryKey: "cuff-bracelets",
            description: "Open cuff bracelet with hand-hammered texture for a raw artisan finish.",
            color: "Warm Brass",
            material: "Solid Brass",
            weight: 0.23,
            tags: ["cuff bracelet", "hammered metal", "artisan style", "stacking"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Filigree Silver Open Cuff",
            sku: "HCJ-BRC-CUF-002",
            price: 61,
            salePrice: 55,
            quantity: 12,
            categoryKey: "bracelets",
            subcategoryKey: "cuff-bracelets",
            description: "Silver-tone open cuff with delicate handcrafted filigree and softly curved ends.",
            color: "Silver",
            material: "Sterling Silver",
            weight: 0.22,
            tags: ["filigree", "silver cuff", "dressy bracelet", "handmade jewelry"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Labradorite Halo Ring",
            sku: "HCJ-RNG-GEM-001",
            price: 74,
            salePrice: 68,
            quantity: 8,
            categoryKey: "rings",
            subcategoryKey: "gemstone-rings",
            description: "Handmade statement ring with oval labradorite stone and halo-style granulation detail.",
            color: "Silver / Blue Flash",
            material: "Sterling Silver, Labradorite",
            weight: 0.12,
            tags: ["gemstone ring", "labradorite", "statement ring", "artisan"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Garnet Vine Ring",
            sku: "HCJ-RNG-GEM-002",
            price: 69,
            salePrice: 63,
            quantity: 9,
            categoryKey: "rings",
            subcategoryKey: "gemstone-rings",
            description: "Vine-textured handcrafted ring finished with a deep red garnet centerpiece.",
            color: "Antique Gold / Red",
            material: "Brass, Garnet",
            weight: 0.11,
            tags: ["garnet", "ring", "gift for her", "botanical jewelry"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Twisted Silver Stack Ring Set",
            sku: "HCJ-RNG-STK-001",
            price: 45,
            salePrice: 39,
            quantity: 20,
            categoryKey: "rings",
            subcategoryKey: "stackable-rings",
            description: "Three-piece stack ring set mixing smooth and twisted handcrafted silver bands.",
            color: "Silver",
            material: "Sterling Silver",
            weight: 0.08,
            tags: ["stack rings", "silver", "minimal jewelry", "gift set"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Mixed Metal Minimal Stack Rings",
            sku: "HCJ-RNG-STK-002",
            price: 48,
            salePrice: 42,
            quantity: 18,
            categoryKey: "rings",
            subcategoryKey: "stackable-rings",
            description: "Slim handcrafted stack rings in mixed silver, gold, and rose-gold finishes.",
            color: "Mixed Metal",
            material: "Brass, Sterling Silver",
            weight: 0.09,
            tags: ["stackable", "mixed metal", "minimal", "everyday ring"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Turquoise Dune Beaded Anklet",
            sku: "HCJ-ANK-BEA-001",
            price: 26,
            salePrice: 22,
            quantity: 24,
            categoryKey: "anklets",
            subcategoryKey: "beaded-anklets",
            description: "Hand-beaded anklet with turquoise tones and sand-inspired neutral accents.",
            color: "Turquoise / Sand",
            material: "Glass Beads, Cotton Cord",
            weight: 0.03,
            tags: ["anklet", "beaded", "summer jewelry", "boho"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Sunset Coral Seed Bead Anklet",
            sku: "HCJ-ANK-BEA-002",
            price: 24,
            salePrice: 20,
            quantity: 26,
            categoryKey: "anklets",
            subcategoryKey: "beaded-anklets",
            description: "Lightweight handmade anklet in coral and blush seed beads for warm-weather styling.",
            color: "Coral / Blush",
            material: "Seed Beads, Nylon Cord",
            weight: 0.03,
            tags: ["seed bead", "anklet", "summer", "handmade accessory"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Tiny Bell Chain Anklet",
            sku: "HCJ-ANK-CHN-001",
            price: 31,
            salePrice: 27,
            quantity: 19,
            categoryKey: "anklets",
            subcategoryKey: "chain-anklets",
            description: "Minimal chain anklet with tiny bell accents that add soft movement and charm.",
            color: "Gold",
            material: "Gold Plated Brass",
            weight: 0.04,
            tags: ["chain anklet", "minimal", "gold", "vacation style"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Moon Charm Chain Anklet",
            sku: "HCJ-ANK-CHN-002",
            price: 33,
            salePrice: 29,
            quantity: 17,
            categoryKey: "anklets",
            subcategoryKey: "chain-anklets",
            description: "Delicate artisan anklet finished with a crescent charm and hand-linked chain.",
            color: "Silver",
            material: "Sterling Silver",
            weight: 0.04,
            tags: ["moon charm", "anklet", "silver jewelry", "gift"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Enamel Daisy Brooch",
            sku: "HCJ-BRP-FLR-001",
            price: 29,
            salePrice: 25,
            quantity: 14,
            categoryKey: "brooches-and-pins",
            subcategoryKey: "floral-brooches",
            description: "Vintage-inspired brooch with hand-painted enamel petals and a cheerful daisy form.",
            color: "White / Yellow",
            material: "Brass, Enamel",
            weight: 0.07,
            tags: ["brooch", "daisy", "floral accessory", "gift"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Hand-stitched Rose Brooch",
            sku: "HCJ-BRP-FLR-002",
            price: 32,
            salePrice: 28,
            quantity: 12,
            categoryKey: "brooches-and-pins",
            subcategoryKey: "floral-brooches",
            description: "Textile rose brooch with layered petals, stitched detailing, and beadwork center.",
            color: "Crimson / Moss",
            material: "Fabric, Beads, Felt",
            weight: 0.06,
            tags: ["textile brooch", "rose", "hand stitched", "artisan pin"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Hammered Copper Feather Pin",
            sku: "HCJ-BRP-ART-001",
            price: 27,
            salePrice: 23,
            quantity: 15,
            categoryKey: "brooches-and-pins",
            subcategoryKey: "artisan-pins",
            description: "Artisan lapel pin shaped like a feather with hammered copper texture and oxidized finish.",
            color: "Copper",
            material: "Copper",
            weight: 0.05,
            tags: ["lapel pin", "copper", "feather", "artisan accessory"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Ceramic Sparrow Artisan Pin",
            sku: "HCJ-BRP-ART-002",
            price: 30,
            salePrice: 26,
            quantity: 11,
            categoryKey: "brooches-and-pins",
            subcategoryKey: "artisan-pins",
            description: "Small handmade ceramic sparrow pin glazed by hand for jackets, totes, and scarves.",
            color: "Blue / Ivory",
            material: "Ceramic, Brass",
            weight: 0.06,
            tags: ["ceramic pin", "bird pin", "artisan", "gift idea"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Pearl Bloom Hair Clip",
            sku: "HCJ-HRJ-CLP-001",
            price: 36,
            salePrice: 31,
            quantity: 16,
            categoryKey: "hair-jewelry",
            subcategoryKey: "hair-clips",
            description: "Floral hair clip decorated with clustered pearls and hand-shaped metal petals.",
            color: "Ivory / Gold",
            material: "Gold Plated Brass, Faux Pearl",
            weight: 0.08,
            tags: ["hair clip", "pearls", "bridal accessory", "gift"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Hammered Leaf Barrette",
            sku: "HCJ-HRJ-CLP-002",
            price: 34,
            salePrice: 30,
            quantity: 18,
            categoryKey: "hair-jewelry",
            subcategoryKey: "hair-clips",
            description: "Artisan barrette with overlapping hammered leaves for a botanical hair statement.",
            color: "Antique Gold",
            material: "Brass",
            weight: 0.09,
            tags: ["barrette", "leaf design", "hair jewelry", "botanical"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Crystal Vine Bridal Hairpiece",
            sku: "HCJ-HRJ-VIN-001",
            price: 88,
            salePrice: 79,
            quantity: 7,
            categoryKey: "hair-jewelry",
            subcategoryKey: "hair-vines",
            description: "Flexible bridal hair vine with crystal sprays and wire-wrapped handcrafted branches.",
            color: "Silver / Crystal",
            material: "Silver Wire, Crystal",
            weight: 0.14,
            tags: ["bridal hair vine", "crystal", "wedding", "hair accessory"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Meadow Pearl Hair Vine",
            sku: "HCJ-HRJ-VIN-002",
            price: 82,
            salePrice: 74,
            quantity: 8,
            categoryKey: "hair-jewelry",
            subcategoryKey: "hair-vines",
            description: "Soft botanical hair vine with pearl clusters, leaf details, and a hand-shaped silhouette.",
            color: "Ivory / Champagne",
            material: "Gold Wire, Freshwater Pearl",
            weight: 0.13,
            tags: ["pearl hair vine", "bridal", "romantic", "formal styling"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Ivory Pearl Bridal Set",
            sku: "HCJ-BRD-SET-001",
            price: 129,
            salePrice: 118,
            quantity: 6,
            categoryKey: "bridal-jewelry",
            subcategoryKey: "bridal-sets",
            description: "Coordinated handcrafted bridal set including necklace, earrings, and bracelet with ivory pearls.",
            color: "Ivory / Silver",
            material: "Sterling Silver, Freshwater Pearl",
            weight: 0.31,
            tags: ["bridal set", "pearl jewelry", "wedding", "gift set"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Rose Gold Crystal Bridal Set",
            sku: "HCJ-BRD-SET-002",
            price: 136,
            salePrice: 124,
            quantity: 5,
            categoryKey: "bridal-jewelry",
            subcategoryKey: "bridal-sets",
            description: "Rose-gold bridal jewelry set with handcrafted crystal detailing for modern ceremony styling.",
            color: "Rose Gold / Crystal",
            material: "Rose Gold Plated Brass, Crystal",
            weight: 0.29,
            tags: ["bridal", "crystal set", "rose gold", "occasion jewelry"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Sage Stone Bridesmaid Necklace",
            sku: "HCJ-BRD-MAI-001",
            price: 42,
            salePrice: 37,
            quantity: 20,
            categoryKey: "bridal-jewelry",
            subcategoryKey: "bridesmaid-jewelry",
            description: "Handmade bridesmaid necklace with soft sage-toned stone and petite teardrop silhouette.",
            color: "Sage / Gold",
            material: "Gold Plated Brass, Aventurine",
            weight: 0.07,
            tags: ["bridesmaid necklace", "sage wedding", "gift", "bridal party"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Blush Pearl Bridesmaid Earrings",
            sku: "HCJ-BRD-MAI-002",
            price: 38,
            salePrice: 33,
            quantity: 22,
            categoryKey: "bridal-jewelry",
            subcategoryKey: "bridesmaid-jewelry",
            description: "Coordinated bridesmaid earrings with blush pearl tones and refined handcrafted hooks.",
            color: "Blush / Gold",
            material: "Gold Plated Brass, Faux Pearl",
            weight: 0.06,
            tags: ["bridesmaid earrings", "pearl", "gift set", "wedding party"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Braided Leather Mens Bracelet",
            sku: "HCJ-MEN-BRC-001",
            price: 41,
            salePrice: 36,
            quantity: 18,
            categoryKey: "mens-jewelry",
            subcategoryKey: "mens-bracelets",
            description: "Men's handcrafted bracelet with braided leather strap and brushed metal clasp.",
            color: "Espresso Brown / Steel",
            material: "Leather, Stainless Steel",
            weight: 0.17,
            tags: ["mens bracelet", "leather", "gift for him", "casual jewelry"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Onyx Bead Mens Bracelet",
            sku: "HCJ-MEN-BRC-002",
            price: 44,
            salePrice: 39,
            quantity: 16,
            categoryKey: "mens-jewelry",
            subcategoryKey: "mens-bracelets",
            description: "Stretch bracelet with polished onyx beads and handcrafted metallic spacers.",
            color: "Black / Gunmetal",
            material: "Onyx, Stainless Steel",
            weight: 0.15,
            tags: ["onyx", "mens jewelry", "bracelet", "minimal style"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Hammered Shield Mens Pendant",
            sku: "HCJ-MEN-PEN-001",
            price: 53,
            salePrice: 47,
            quantity: 12,
            categoryKey: "mens-jewelry",
            subcategoryKey: "mens-pendants",
            description: "Handcrafted shield pendant necklace with hammered surface and darkened edge detail.",
            color: "Gunmetal",
            material: "Stainless Steel",
            weight: 0.19,
            tags: ["mens pendant", "shield", "gift for him", "handcrafted"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "Rune Tag Mens Pendant",
            sku: "HCJ-MEN-PEN-002",
            price: 56,
            salePrice: 49,
            quantity: 10,
            categoryKey: "mens-jewelry",
            subcategoryKey: "mens-pendants",
            description: "Tag-style pendant engraved with rune-inspired marks and finished by hand.",
            color: "Matte Silver",
            material: "Sterling Silver",
            weight: 0.18,
            tags: ["mens pendant", "rune", "silver necklace", "symbolic jewelry"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Gold Initial Disc Necklace",
            sku: "HCJ-PRS-INI-001",
            price: 47,
            salePrice: 42,
            quantity: 19,
            categoryKey: "personalized-jewelry",
            subcategoryKey: "initial-jewelry",
            description: "Disc necklace with hand-stamped initial styling and polished gold finish.",
            color: "Gold",
            material: "Gold Vermeil",
            weight: 0.08,
            tags: ["initial necklace", "personalized jewelry", "gift", "minimal"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "Stamped Initial Bar Bracelet",
            sku: "HCJ-PRS-INI-002",
            price: 43,
            salePrice: 38,
            quantity: 21,
            categoryKey: "personalized-jewelry",
            subcategoryKey: "initial-jewelry",
            description: "Slim bar bracelet with handcrafted stamped-initial styling and adjustable chain.",
            color: "Rose Gold",
            material: "Rose Gold Plated Brass",
            weight: 0.07,
            tags: ["initial bracelet", "personalized gift", "bar bracelet", "custom feel"],
            isFeatured: false,
            availabilityStatus: "in_stock",
        },
        {
            name: "January Garnet Birthstone Ring",
            sku: "HCJ-PRS-BTH-001",
            price: 58,
            salePrice: 52,
            quantity: 13,
            categoryKey: "personalized-jewelry",
            subcategoryKey: "birthstone-jewelry",
            description: "Handmade birthstone ring featuring a rich garnet cabochon for January gifting.",
            color: "Silver / Deep Red",
            material: "Sterling Silver, Garnet",
            weight: 0.09,
            tags: ["birthstone ring", "garnet", "January gift", "meaningful jewelry"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
        {
            name: "June Moonstone Birthstone Necklace",
            sku: "HCJ-PRS-BTH-002",
            price: 61,
            salePrice: 55,
            quantity: 14,
            categoryKey: "personalized-jewelry",
            subcategoryKey: "birthstone-jewelry",
            description: "Birthstone necklace with a glowing moonstone centerpiece and handcrafted bezel setting.",
            color: "Silver / White",
            material: "Sterling Silver, Moonstone",
            weight: 0.1,
            tags: ["birthstone necklace", "moonstone", "June gift", "artisan necklace"],
            isFeatured: true,
            availabilityStatus: "in_stock",
        },
    ],
};

const buildSlug = (value) => slugify(value, { lower: true, strict: true });

const validateCatalogShape = () => {
    const { categories, subcategories, products } = handcraftJewelryCatalog;

    if (categories.length !== 10) {
        throw new Error(`Expected 10 categories, received ${categories.length}`);
    }

    if (subcategories.length !== 20) {
        throw new Error(`Expected 20 subcategories, received ${subcategories.length}`);
    }

    if (products.length !== 40) {
        throw new Error(`Expected 40 products, received ${products.length}`);
    }

    for (const category of categories) {
        const linkedSubcategories = subcategories.filter(
            (subcategory) => subcategory.categoryKey === category.key
        );

        if (linkedSubcategories.length < 2) {
            throw new Error(`Category ${category.name} must have at least 2 subcategories`);
        }
    }

    for (const subcategory of subcategories) {
        const linkedProducts = products.filter(
            (product) => product.subcategoryKey === subcategory.key
        );

        if (linkedProducts.length < 2) {
            throw new Error(`Subcategory ${subcategory.name} must have at least 2 products`);
        }
    }
};

validateCatalogShape();

const upsertCategories = async () => {
    const categoryMap = new Map();

    for (const category of handcraftJewelryCatalog.categories) {
        const slug = buildSlug(category.name);
        const savedCategory = await Category.findOneAndUpdate(
            { slug },
            {
                $set: {
                    name: category.name,
                    slug,
                    description: category.description,
                    isFeatured: category.isFeatured,
                    status: category.status,
                },
            },
            {
                returnDocument: "after",
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true,
            }
        );

        categoryMap.set(category.key, savedCategory);
    }

    return categoryMap;
};

const upsertSubcategories = async (categoryMap) => {
    const subcategoryMap = new Map();

    for (const subcategory of handcraftJewelryCatalog.subcategories) {
        const linkedCategory = categoryMap.get(subcategory.categoryKey);

        if (!linkedCategory) {
            throw new Error(`Missing category for subcategory: ${subcategory.name}`);
        }

        const slug = buildSlug(subcategory.name);
        const savedSubcategory = await Subcategory.findOneAndUpdate(
            { slug },
            {
                $set: {
                    name: subcategory.name,
                    slug,
                    description: subcategory.description,
                    category: linkedCategory._id,
                    isFeatured: subcategory.isFeatured,
                    status: subcategory.status,
                },
            },
            {
                returnDocument: "after",
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true,
            }
        );

        subcategoryMap.set(subcategory.key, savedSubcategory);
    }

    return subcategoryMap;
};

const upsertProducts = async (categoryMap, subcategoryMap) => {
    for (const product of handcraftJewelryCatalog.products) {
        const linkedCategory = categoryMap.get(product.categoryKey);
        const linkedSubcategory = subcategoryMap.get(product.subcategoryKey);

        if (!linkedCategory) {
            throw new Error(`Missing category for product: ${product.name}`);
        }

        if (!linkedSubcategory) {
            throw new Error(`Missing subcategory for product: ${product.name}`);
        }

        const slug = buildSlug(product.name);

        await Product.findOneAndUpdate(
            { sku: product.sku },
            {
                $set: {
                    name: product.name,
                    slug,
                    price: product.price,
                    salePrice: product.salePrice,
                    currency: "USD",
                    category: linkedCategory._id,
                    subcategory: linkedSubcategory._id,
                    quantity: product.quantity,
                    description: product.description,
                    color: product.color,
                    status: "active",
                    isFeatured: product.isFeatured,
                    weight: product.weight,
                    tags: product.tags,
                    sku: product.sku,
                    availabilityStatus: product.availabilityStatus,
                    material: product.material,
                    lowStockThreshold: 5,
                    deliveryEstimate: defaultDeliveryEstimate,
                    richMedia: {
                        videos: [],
                        view360Images: [],
                    },
                    policySurfaces: defaultPolicySurfaces,
                },
            },
            {
                returnDocument: "after",
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true,
            }
        );
    }
};

const seedHandcraftCatalog = async () => {
    await connectDB();

    try {
        const categoryMap = await upsertCategories();
        const subcategoryMap = await upsertSubcategories(categoryMap);
        await upsertProducts(categoryMap, subcategoryMap);

        console.log("Handcraft jewelry catalog seed complete.");
        console.log(`Categories: ${handcraftJewelryCatalog.categories.length}`);
        console.log(`Subcategories: ${handcraftJewelryCatalog.subcategories.length}`);
        console.log(`Products: ${handcraftJewelryCatalog.products.length}`);
    } finally {
        await mongoose.disconnect();
    }
};

if (require.main === module) {
    seedHandcraftCatalog().catch((error) => {
        console.error("Failed to seed handcraft jewelry catalog:", error.message);
        process.exit(1);
    });
}

module.exports = {
    handcraftJewelryCatalog,
    seedHandcraftCatalog,
};