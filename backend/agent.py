import os
import pandas as pd
from google import genai
from google.genai import types

# 1. Initialisation du client natif Gemini
client = genai.Client()

# 2. Outil (Tool) connecté à la base de données Excel
def verifier_stock_et_prix(nom_produit: str) -> str:
    """
    Vérifie la disponibilité, le prix et le délai de livraison d'un produit spécifique 
    dans le catalogue d'inventaire Excel de l'entreprise.

    Args:
        nom_produit: Le nom du produit à rechercher (ex: 'routeur x200', 'switch catalyst').
    """
    fichier_excel = "product_catalog.xlsx"
    
    if not os.path.exists(fichier_excel):
        return "Erreur technique : La base de données Excel est introuvable."
    
    try:
        # Lecture du fichier Excel avec Pandas
        df = pd.read_excel(fichier_excel)
        
        # Nettoyage des chaînes pour une recherche insensible à la casse et aux espaces
        df_clean = df.copy()
        df_clean['Nom Produit Clean'] = df_clean['Nom Produit'].astype(str).str.lower().str.strip()
        produit_recherche = nom_produit.lower().strip()
        
        # Recherche de correspondance dans le dataframe
        resultat = df_clean[df_clean['Nom Produit Clean'] == produit_recherche]
        
        if not resultat.empty:
            row = resultat.iloc[0]
            nom = row['Nom Produit']
            statut = row['Statut']
            prix = row['Prix (FCFA)']
            delai = row['Délai de livraison']
            
            # Formatage de la réponse brute pour le LLM
            return f"Produit: {nom} | Statut: {statut} | Prix: {prix:,} FCFA | Délai: {delai}".replace(',', ' ')
        else:
            return f"Statut: Inconnu | Le produit '{nom_produit}' n'est pas répertorié dans le fichier Excel."
            
    except Exception as e:
        return f"Erreur lors de la lecture de la base de données : {str(e)}"


# 3. Fonction d'exécution de l'Agent
def executer_agent_b2b(requete_client: str):
    print(f"📥 Message Client : {requete_client}")
    print("🤖 L'agent interroge le LLM et inspecte les outils requis...")
    
    reponse = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=requete_client,
        config=types.GenerateContentConfig(
            system_instruction=(
                "Tu es un agent d'automatisation d'inventaire B2B de haut niveau. "
                "Tu as un accès direct au catalogue via l'outil 'verifier_stock_et_prix'. "
                "Lorsqu'un client demande un tarif, une disponibilité ou des détails sur un produit, "
                "utilise TOUJOURS l'outil avant de répondre. "
                "Formate tes réponses financières avec clarté en FCFA. Sois professionnel et concis."
            ),
            tools=[verifier_stock_et_prix],
            temperature=0.15
        )
    )
    return reponse.text

# 4. Scénario de test réel sur le fichier Excel
if __name__ == "__main__":
    # Test avec un produit présent dans le nouvel Excel
    requete = "Bonjour, est-ce que vous vendez un Switch Catalyst 9300 ? Si oui, à quel prix et sous quel délai ?"
    reponse_agent = executer_agent_b2b(requete)
    print("\n✨ Réponse finale de l'agent :")
    print(reponse_agent)