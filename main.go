package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	path, err := defaultStorePath()
	if err != nil {
		log.Fatal(err)
	}
	store, err := NewStore(path)
	if err != nil {
		log.Fatal(err)
	}
	app := NewApp(store)

	err = wails.Run(&options.App{
		Title:     "sshng",
		Width:     1280,
		Height:    800,
		MinWidth:  720,
		MinHeight: 420,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 24, G: 25, B: 30, A: 255},
		OnStartup:        app.startup,
		OnBeforeClose:    app.beforeClose,
		OnShutdown:       app.shutdown,
		Bind:             []interface{}{app},
		Windows: &windows.Options{
			Theme:                windows.Dark, // matches the app's dark UI
			IsZoomControlEnabled: false,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
