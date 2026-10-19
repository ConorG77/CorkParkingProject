import json
#import csv
import requests


url = 'https://data.corkcity.ie/api/3/action/datastore_search?resource_id=f4677dac-bb30-412e-95a8-d3c22134e3c0'

datain = requests.get(url)
data=datain.json()

parking_records = data["result"]["records"]
print("Name,Spaces,free spaces.opening_times,height_restrictions,price,lat,long")
filedata=""
for carpark in parking_records:
    filedata+=(f"{carpark['name']},{carpark['spaces']},{carpark['free_spaces']},{carpark['opening_times']},{carpark['height_restrictions']},{carpark['price']},{carpark['latitude']},{carpark['longitude']}\n")
print(filedata)
