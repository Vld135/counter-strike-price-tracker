# counter-strike-price-tracker

This repository provides access to price data for Counter-Strike items via static JSON files. Here's how you can fetch the data:

>[!NOTE]
>All prices are listed in usd

---

## Latest Prices

You can fetch the **latest prices** for all items from the following endpoint:


This file contains a JSON object where each key is the market hash name of the item, and the value is its latest steam price.

---

## Specific Item Price History

To fetch the **price history** for a specific item, use the following endpoint:



Replace `{hash}` with the hashed market hash name of the item. For example:

**Item:** `AWP | Dragon Lore (Factory New)`  
**Hash:** `12d095d45089fff0c2e1f689ed7b1f352d087f95`  
**Endpoint:** 


This file contains the item's price history as an array of price points.

---



